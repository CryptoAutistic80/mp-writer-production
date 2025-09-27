import { BadRequestException, Injectable, Logger, MessageEvent } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WritingDeskIntakeDto } from './dto/writing-desk-intake.dto';
import { WritingDeskFollowUpDto } from './dto/writing-desk-follow-up.dto';
import { UserCreditsService } from '../user-credits/user-credits.service';
import { WritingDeskJobsService } from '../writing-desk-jobs/writing-desk-jobs.service';
import { ActiveWritingDeskJobResource } from '../writing-desk-jobs/writing-desk-jobs.types';
import { UpsertActiveWritingDeskJobDto } from '../writing-desk-jobs/dto/upsert-active-writing-desk-job.dto';
import { Observable } from 'rxjs';
import type { Stream } from 'openai/streaming';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';

const FOLLOW_UP_CREDIT_COST = 0.1;
const DEEP_RESEARCH_CREDIT_COST = 0.7;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openaiClient: any | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly userCredits: UserCreditsService,
    private readonly writingDeskJobs: WritingDeskJobsService,
  ) {}

  private async getOpenAiClient(apiKey: string) {
    if (this.openaiClient) return this.openaiClient;
    const { default: OpenAI } = await import('openai');
    this.openaiClient = new OpenAI({ apiKey });
    return this.openaiClient;
  }

  async generate(input: { prompt: string; model?: string }) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const model = input.model || this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    if (!apiKey) {
      // In dev without key, return a stub so flows work
      return { content: `DEV-STUB: ${input.prompt.slice(0, 120)}...` };
    }
    const client = await this.getOpenAiClient(apiKey);
    const resp = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: input.prompt }],
      temperature: 0.7,
    });
    const content = resp.choices?.[0]?.message?.content ?? '';
    return { content };
  }

  async generateWritingDeskFollowUps(userId: string | null | undefined, input: WritingDeskIntakeDto) {
    if (!userId) {
      throw new BadRequestException('User account required');
    }

    const { credits: remainingAfterCharge } = await this.userCredits.deductFromMine(userId, FOLLOW_UP_CREDIT_COST);
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const model = this.config.get<string>('OPENAI_FOLLOW_UP_MODEL')?.trim() || 'gpt-5-mini';

    try {
      if (!apiKey) {
        const stubQuestions = this.buildStubFollowUps(input);
        this.logger.log(
          `[writing-desk step1] DEV-STUB ${JSON.stringify({
            model: 'dev-stub',
            input,
            followUpQuestions: stubQuestions,
          })}`,
        );
        return {
          model: 'dev-stub',
          responseId: 'dev-stub',
          followUpQuestions: stubQuestions,
          notes: null,
          remainingCredits: remainingAfterCharge,
        };
      }

      const client = await this.getOpenAiClient(apiKey);

      const instructions = `You help constituents prepare to write letters to their Members of Parliament.
From the provided information, identify up to three missing details that would materially strengthen the letter.
Ask at most three concise follow-up questions. If everything is already clear, return an empty list.
Focus on understanding the core issue better - ask about the nature of the problem, its impact, timeline, or context.
Do NOT ask for documents, permissions, names, addresses, or personal details. Only ask about the issue itself.`;

      const userSummary = `Issue detail:\n${input.issueDetail}\n\nAffected parties:\n${input.affectedDetail}\n\nSupporting background:\n${input.backgroundDetail}\n\nDesired outcome:\n${input.desiredOutcome}`;

      const response = await client.responses.create({
        model,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: instructions }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: userSummary }],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'writing_desk_follow_up',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                questions: {
                  type: 'array',
                  description: 'Up to three clarifying follow-up questions for the user.',
                  maxItems: 3,
                  items: {
                    type: 'string',
                    description: 'A succinct question phrased conversationally.',
                  },
                },
                notes: {
                  type: 'string',
                  description: 'Optional short justification of why these questions matter.',
                  default: '',
                },
              },
              required: ['questions', 'notes'],
            },
          },
          verbosity: 'low',
        },
        reasoning: {
          effort: 'low',
          summary: null,
        },
        tools: [],
        store: true,
        include: ['reasoning.encrypted_content', 'web_search_call.action.sources'],
      });

      let parsed: { questions?: string[]; notes?: string } = {};
      const outputText = this.extractFirstText(response);
      if (outputText) {
        try {
          parsed = JSON.parse(outputText);
        } catch (err) {
          this.logger.warn(`Failed to parse follow-up response JSON: ${(err as Error).message}`);
        }
      }

      const followUpQuestions = Array.isArray(parsed.questions)
        ? parsed.questions.filter((q) => typeof q === 'string' && q.trim().length > 0)
        : [];

      const bundle = {
        model,
        responseId: (response as any)?.id ?? null,
        input,
        followUpQuestions,
        notes: parsed.notes,
      };
      this.logger.log(`[writing-desk step1] ${JSON.stringify(bundle)}`);

      return {
        model,
        responseId: (response as any)?.id ?? null,
        followUpQuestions,
        notes: parsed.notes ?? null,
        remainingCredits: remainingAfterCharge,
      };
    } catch (error) {
      await this.refundCredits(userId, FOLLOW_UP_CREDIT_COST);
      throw error;
    }
  }

  async recordWritingDeskFollowUps(input: WritingDeskFollowUpDto) {
    if (input.followUpQuestions.length !== input.followUpAnswers.length) {
      throw new BadRequestException('Answers must be provided for each follow-up question');
    }

    const cleanedQuestions = input.followUpQuestions.map((question) => question?.toString?.().trim?.() ?? '');
    const cleanedAnswers = input.followUpAnswers.map((answer) => answer?.trim?.() ?? '');
    if (cleanedAnswers.some((answer) => !answer)) {
      throw new BadRequestException('Follow-up answers cannot be empty');
    }

    const bundle = {
      issueDetail: input.issueDetail.trim(),
      affectedDetail: input.affectedDetail.trim(),
      backgroundDetail: input.backgroundDetail.trim(),
      desiredOutcome: input.desiredOutcome.trim(),
      followUpQuestions: cleanedQuestions,
      followUpAnswers: cleanedAnswers,
      notes: input.notes?.trim?.() || null,
      responseId: input.responseId ?? null,
      recordedAt: new Date().toISOString(),
    };

    this.logger.log(`[writing-desk step1-answers] ${JSON.stringify(bundle)}`);

    return { ok: true };
  }

  streamWritingDeskDeepResearch(
    userId: string | null | undefined,
    options?: { jobId?: string | null },
  ): Observable<MessageEvent> {
    if (!userId) {
      throw new BadRequestException('User account required');
    }

    return new Observable<MessageEvent>((subscriber) => {
      let deductionApplied = false;
      let settled = false;
      let remainingCredits: number | null = null;
      let openAiStream: Stream<ResponseStreamEvent> | null = null;
      let aggregatedText = '';
      let baselineJob: ActiveWritingDeskJobResource | null = null;

      const send = (payload: Record<string, unknown>) => {
        if (subscriber.closed) return;
        subscriber.next({ data: JSON.stringify(payload) });
      };

      const run = async () => {
        try {
          baselineJob = await this.resolveActiveWritingDeskJob(userId, options?.jobId ?? null);
          const prompt = this.buildDeepResearchPrompt(baselineJob);

          send({ type: 'status', status: 'starting' });

          const { credits } = await this.userCredits.deductFromMine(userId, DEEP_RESEARCH_CREDIT_COST);
          deductionApplied = true;
          remainingCredits = credits;
          send({ type: 'status', status: 'charged', remainingCredits: credits });

          const apiKey = this.config.get<string>('OPENAI_API_KEY');
          const model = this.config.get<string>('OPENAI_DEEP_RESEARCH_MODEL')?.trim() || 'o4-mini-deep-research';

          if (!apiKey) {
            const stub = this.buildDeepResearchStub(baselineJob);
            for (const chunk of stub.chunks) {
              send({ type: 'delta', text: chunk });
              await this.delay(180);
            }
            await this.persistDeepResearchResult(userId, baselineJob, {
              content: stub.content,
              responseId: 'dev-stub',
            });
            settled = true;
            send({
              type: 'complete',
              content: stub.content,
              responseId: 'dev-stub',
              remainingCredits,
            });
            subscriber.complete();
            return;
          }

          const client = await this.getOpenAiClient(apiKey);
          const requestExtras = this.buildDeepResearchRequestExtras();

          this.logger.log(
            `[writing-desk research] start ${JSON.stringify({ userId, jobId: baselineJob.jobId, model, tools: requestExtras.tools?.length ?? 0 })}`,
          );

          openAiStream = (await client.responses.create({
            model,
            input: prompt,
            background: true,
            store: true,
            stream: true,
            ...requestExtras,
          })) as Stream<ResponseStreamEvent>;

          for await (const event of openAiStream) {
            if (!event) continue;

            switch (event.type) {
              case 'response.created':
                send({ type: 'status', status: 'queued' });
                break;
              case 'response.queued':
                send({ type: 'status', status: 'queued' });
                break;
              case 'response.in_progress':
                send({ type: 'status', status: 'in_progress' });
                break;
              case 'response.output_text.delta':
                if (typeof event.delta === 'string' && event.delta.length > 0) {
                  aggregatedText += event.delta;
                  send({ type: 'delta', text: event.delta });
                }
                break;
              case 'response.output_text.done':
                if (!aggregatedText && typeof event.text === 'string') {
                  aggregatedText = event.text;
                }
                break;
              case 'response.web_search_call.searching':
              case 'response.web_search_call.in_progress':
              case 'response.web_search_call.completed':
              case 'response.file_search_call.searching':
              case 'response.file_search_call.in_progress':
              case 'response.file_search_call.completed':
              case 'response.code_interpreter_call.in_progress':
              case 'response.code_interpreter_call.completed':
              case 'response.reasoning.delta':
              case 'response.reasoning.done':
                send({ type: 'event', event });
                break;
              case 'response.failed':
              case 'response.incomplete': {
                const errorMessage = (event as any)?.error?.message ?? 'Deep research failed';
                throw new Error(errorMessage);
              }
              case 'response.completed': {
                const finalResponse = event.response;
                const responseId = (finalResponse as any)?.id ?? null;
                const finalText = this.extractFirstText(finalResponse) ?? aggregatedText;
                await this.persistDeepResearchResult(userId, baselineJob, {
                  content: finalText,
                  responseId,
                });
                settled = true;
                send({
                  type: 'complete',
                  content: finalText,
                  responseId,
                  remainingCredits,
                  usage: (finalResponse as any)?.usage ?? null,
                });
                subscriber.complete();
                return;
              }
              default:
                send({ type: 'event', event });
            }
          }

          if (!settled) {
            throw new Error('Deep research stream ended unexpectedly');
          }
        } catch (error) {
          this.logger.error(
            `[writing-desk research] failure ${
              error instanceof Error ? error.message : 'unknown'
            }`,
          );

          if (deductionApplied && !settled) {
            await this.refundCredits(userId, DEEP_RESEARCH_CREDIT_COST);
            remainingCredits =
              typeof remainingCredits === 'number'
                ? Math.round((remainingCredits + DEEP_RESEARCH_CREDIT_COST) * 100) / 100
                : null;
          }

          settled = true;

          const message =
            error instanceof BadRequestException
              ? error.message
              : 'Deep research failed. Please try again in a few moments.';

          send({
            type: 'error',
            message,
            remainingCredits,
          });
          subscriber.complete();
        }
      };

      void run();

      return () => {
        if (openAiStream?.controller) {
          try {
            openAiStream.controller.abort();
          } catch (err) {
            this.logger.warn(
              `Failed to abort deep research stream: ${(err as Error)?.message ?? 'unknown error'}`,
            );
          }
        }

        if (deductionApplied && !settled) {
          void this.refundCredits(userId, DEEP_RESEARCH_CREDIT_COST);
        }
      };
    });
  }

  private async resolveActiveWritingDeskJob(
    userId: string,
    jobId: string | null,
  ): Promise<ActiveWritingDeskJobResource> {
    const job = await this.writingDeskJobs.getActiveJobForUser(userId);
    if (!job) {
      throw new BadRequestException(
        'We could not find an active letter to research. Save your answers and try again.',
      );
    }
    if (jobId && job.jobId !== jobId) {
      throw new BadRequestException(
        'Your saved letter changed. Refresh the page before running deep research again.',
      );
    }
    return job;
  }

  private buildDeepResearchPrompt(job: ActiveWritingDeskJobResource): string {
    const sections: string[] = [
      'Research the issue described below and gather supporting facts, quotes, and statistics from credible, up-to-date sources.',
      'Provide a structured evidence report with inline citations for every key fact. Cite URLs or publication titles for each data point.',
      '',
      `Issue Detail: ${this.normalisePromptField(job.form?.issueDetail, 'Not provided.')}`,
      `Affected Parties: ${this.normalisePromptField(job.form?.affectedDetail, 'Not provided.')}`,
      `Background: ${this.normalisePromptField(job.form?.backgroundDetail, 'Not provided.')}`,
      `Desired Outcome: ${this.normalisePromptField(job.form?.desiredOutcome, 'Not provided.')}`,
    ];

    if (Array.isArray(job.followUpQuestions) && job.followUpQuestions.length > 0) {
      sections.push('', 'Additional Context from Q&A:');
      job.followUpQuestions.forEach((question, index) => {
        const answer = job.followUpAnswers?.[index] ?? '';
        const q = question?.trim?.() ?? '';
        const a = answer?.trim?.() ?? '';
        sections.push(`Q${index + 1}: ${q || 'No question provided.'}`);
        sections.push(`A${index + 1}: ${a || 'No answer provided.'}`);
      });
    }

    if (job.notes?.trim()) {
      sections.push('', `Notes: ${job.notes.trim()}`);
    }

    sections.push(
      '',
      'Output Requirements:',
      '- Group evidence by theme or timeline using short paragraphs or bullet lists.',
      '- Include inline citations with source name and URL for every statistic, quote, or claim.',
      '- Prioritise authoritative sources (government publications, official statistics, reputable journalism).',
      '- Highlight material published within the last three years whenever available.',
      '- Call out any gaps in public evidence instead of guessing.',
    );

    return sections.join('\n');
  }

  private normalisePromptField(value: string | null | undefined, fallback: string): string {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  private buildDeepResearchStub(job: ActiveWritingDeskJobResource) {
    const lines = [
      'DEV-STUB deep research summary (no external research was performed).',
      '',
      `• Issue focus: ${this.truncateForStub(job.form?.issueDetail)}`,
      `• Impact summary: ${this.truncateForStub(job.form?.affectedDetail)}`,
      `• Requested outcome: ${this.truncateForStub(job.form?.desiredOutcome)}`,
      '',
      'Suggested evidence to look for:',
      '1. Recent government or regulator statistics quantifying the scale of the issue.',
      '2. Quotes from reputable organisations, MPs, or investigative journalism covering the topic.',
      '3. Current policy commitments or funding schemes that relate to the requested outcome.',
      '',
      'Sources to consider:',
      '- GOV.UK and departmental research portals (latest releases).',
      '- Office for National Statistics datasets relevant to the subject.',
      '- Reputable national journalism such as the BBC, The Guardian, or Financial Times.',
    ];

    const content = lines.join('\n');
    const chunks = [
      `${lines[0]}\n\n`,
      `${lines[2]}\n${lines[3]}\n${lines[4]}\n\n`,
      `${lines[5]}\n${lines[6]}\n${lines[7]}\n${lines[8]}\n\n`,
      `${lines[9]}\n${lines[10]}\n${lines[11]}`,
    ];

    return { content, chunks };
  }

  private truncateForStub(value: string | null | undefined): string {
    if (typeof value !== 'string') return 'Not provided.';
    const trimmed = value.trim();
    if (trimmed.length <= 160) return trimmed || 'Not provided.';
    return `${trimmed.slice(0, 157)}…`;
  }

  private buildDeepResearchRequestExtras(): Record<string, unknown> {
    const tools: Array<Record<string, unknown>> = [];

    const enableWebSearch = this.parseBooleanEnv(
      this.config.get<string>('OPENAI_DEEP_RESEARCH_ENABLE_WEB_SEARCH'),
      true,
    );
    if (enableWebSearch) {
      const tool: Record<string, unknown> = { type: 'web_search_preview' };
      const contextSize = this.config
        .get<string>('OPENAI_DEEP_RESEARCH_WEB_SEARCH_CONTEXT_SIZE')
        ?.trim();
      if (contextSize) {
        tool.context_size = contextSize;
      }
      tools.push(tool);
    }

    const vectorStoreRaw = this.config.get<string>('OPENAI_DEEP_RESEARCH_VECTOR_STORE_IDS')?.trim();
    if (vectorStoreRaw) {
      const vectorStoreIds = vectorStoreRaw
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      if (vectorStoreIds.length > 0) {
        tools.push({ type: 'file_search', vector_store_ids: vectorStoreIds });
      }
    }

    const enableCodeInterpreter = this.parseBooleanEnv(
      this.config.get<string>('OPENAI_DEEP_RESEARCH_ENABLE_CODE_INTERPRETER'),
      false,
    );
    if (enableCodeInterpreter) {
      tools.push({ type: 'code_interpreter', container: { type: 'auto' } });
    }

    const extras: Record<string, unknown> = {};
    if (tools.length > 0) {
      extras.tools = tools;
    }

    const maxToolCalls = this.parseOptionalInt(
      this.config.get<string>('OPENAI_DEEP_RESEARCH_MAX_TOOL_CALLS'),
    );
    if (typeof maxToolCalls === 'number' && maxToolCalls > 0) {
      extras.max_tool_calls = maxToolCalls;
    }

    return extras;
  }

  private parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
    if (typeof raw !== 'string') return fallback;
    const value = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(value)) return true;
    if (['0', 'false', 'no', 'off'].includes(value)) return false;
    return fallback;
  }

  private parseOptionalInt(raw: string | undefined): number | null {
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private async persistDeepResearchResult(
    userId: string,
    fallback: ActiveWritingDeskJobResource,
    result: { content: string | null | undefined; responseId: string | null | undefined },
  ) {
    const latest = await this.writingDeskJobs.getActiveJobForUser(userId);
    const job = latest ?? fallback;
    const payload = this.buildResearchUpsertPayload(job, result);
    await this.writingDeskJobs.upsertActiveJob(userId, payload);
  }

  private buildResearchUpsertPayload(
    job: ActiveWritingDeskJobResource,
    result: { content: string | null | undefined; responseId: string | null | undefined },
  ): UpsertActiveWritingDeskJobDto {
    const payload: UpsertActiveWritingDeskJobDto = {
      jobId: job.jobId,
      phase: job.phase,
      stepIndex: job.stepIndex,
      followUpIndex: job.followUpIndex,
      form: {
        issueDetail: job.form?.issueDetail ?? '',
        affectedDetail: job.form?.affectedDetail ?? '',
        backgroundDetail: job.form?.backgroundDetail ?? '',
        desiredOutcome: job.form?.desiredOutcome ?? '',
      },
      followUpQuestions: Array.isArray(job.followUpQuestions) ? [...job.followUpQuestions] : [],
      followUpAnswers: Array.isArray(job.followUpAnswers) ? [...job.followUpAnswers] : [],
      notes: job.notes ?? undefined,
      responseId: job.responseId ?? undefined,
    };

    const researchContent = this.normaliseResearchContent(result.content);
    if (researchContent !== null) {
      payload.researchContent = researchContent;
    }

    const researchResponseId = result.responseId?.toString?.().trim?.();
    if (researchResponseId) {
      payload.researchResponseId = researchResponseId;
    }

    return payload;
  }

  private normaliseResearchContent(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const normalised = value.replace(/\r\n/g, '\n');
    return normalised.trim().length > 0 ? normalised : null;
  }

  private async delay(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private extractFirstText(response: any): string | null {
    if (!response) return null;
    const direct = response?.output_text;
    if (typeof direct === 'string' && direct.trim().length > 0) {
      return direct;
    }
    const steps = Array.isArray(response?.output) ? response.output : [];
    for (const step of steps) {
      const contentItems = Array.isArray(step?.content) ? step.content : [];
      for (const item of contentItems) {
        if (typeof item?.text === 'string' && item.text.trim().length > 0) {
          return item.text;
        }
        if (item?.type === 'output_text' && typeof item?.content === 'string') {
          return item.content;
        }
      }
    }
    return null;
  }

  private async refundCredits(userId: string, amount: number) {
    try {
      await this.userCredits.addToMine(userId, amount);
    } catch (err) {
      this.logger.error(`Failed to refund credits for user ${userId}: ${(err as Error).message}`);
    }
  }

  private buildStubFollowUps(input: WritingDeskIntakeDto) {
    const questions: string[] = [];
    
    // Check if issue detail is too brief or vague
    if (input.issueDetail.length < 100 || !/\b(problem|issue|concern|matter)\b/i.test(input.issueDetail)) {
      questions.push('Can you describe the specific problem or issue you\'re facing in more detail?');
    }
    
    // Check if affected parties need more detail
    if (input.affectedDetail.length < 50 || !/\b(people|residents|community|families|businesses)\b/i.test(input.affectedDetail)) {
      questions.push('Who else is affected by this issue in your area?');
    }
    
    // Check if desired outcome is clear
    if (input.desiredOutcome.length < 50 || !/\b(want|need|hope|expect|should|must)\b/i.test(input.desiredOutcome)) {
      questions.push('What specific outcome or resolution are you hoping for?');
    }
    
    return questions.slice(0, 3);
  }
}
