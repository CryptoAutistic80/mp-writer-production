import { BadRequestException, Injectable, Logger, MessageEvent } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WritingDeskIntakeDto } from './dto/writing-desk-intake.dto';
import { WritingDeskFollowUpDto } from './dto/writing-desk-follow-up.dto';
import { UserCreditsService } from '../user-credits/user-credits.service';
import { WritingDeskJobsService } from '../writing-desk-jobs/writing-desk-jobs.service';
import { UserMpService } from '../user-mp/user-mp.service';
import { ActiveWritingDeskJobResource, WritingDeskResearchStatus } from '../writing-desk-jobs/writing-desk-jobs.types';
import { UpsertActiveWritingDeskJobDto } from '../writing-desk-jobs/dto/upsert-active-writing-desk-job.dto';
import { Observable, ReplaySubject, Subscription } from 'rxjs';
import type { Stream } from 'openai/streaming';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';

const FOLLOW_UP_CREDIT_COST = 0.1;
const DEEP_RESEARCH_CREDIT_COST = 0.7;

type DeepResearchRequestExtras = {
  tools?: Array<Record<string, unknown>>;
  max_tool_calls?: number;
  reasoning?: {
    summary?: 'auto' | 'disabled' | null;
    effort?: 'low' | 'medium' | 'high';
  };
};

type DeepResearchStreamPayload =
  | { type: 'status'; status: string; remainingCredits?: number | null }
  | { type: 'delta'; text: string }
  | { type: 'event'; event: Record<string, unknown> }
  | {
      type: 'complete';
      content: string;
      responseId: string | null;
      remainingCredits: number | null;
      usage?: Record<string, unknown> | null;
    }
  | { type: 'error'; message: string; remainingCredits?: number | null };

type DeepResearchRunStatus = 'running' | 'completed' | 'error';

interface DeepResearchRun {
  key: string;
  userId: string;
  jobId: string;
  subject: ReplaySubject<DeepResearchStreamPayload>;
  status: DeepResearchRunStatus;
  startedAt: number;
  cleanupTimer: NodeJS.Timeout | null;
  promise: Promise<void> | null;
  responseId: string | null;
}

const DEEP_RESEARCH_RUN_BUFFER_SIZE = 2000;
const DEEP_RESEARCH_RUN_TTL_MS = 5 * 60 * 1000;
const BACKGROUND_POLL_INTERVAL_MS = 2000;
const BACKGROUND_POLL_TIMEOUT_MS = 20 * 60 * 1000;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openaiClient: any | null = null;
  private readonly deepResearchRuns = new Map<string, DeepResearchRun>();

  constructor(
    private readonly config: ConfigService,
    private readonly userCredits: UserCreditsService,
    private readonly writingDeskJobs: WritingDeskJobsService,
    private readonly userMp: UserMpService,
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
From the provided description, identify the most important gaps that stop you fully understanding the situation and what outcome the constituent wants.
Ask at most five concise follow-up questions. If everything is already clear, return an empty list.
Prioritise clarifying the specific problem, how it affects people, what has already happened, and what the constituent hopes their MP will achieve.
Do NOT ask for documents, permissions, names, addresses, or personal details. Only ask about the issue itself.`;

      const userSummary = `Constituent description:\n${input.issueDescription}`;

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
                  description: 'Up to five clarifying follow-up questions for the user.',
                  maxItems: 5,
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
      issueDescription: input.issueDescription.trim(),
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
      let subscription: Subscription | null = null;
      let settled = false;

      const attach = async () => {
        try {
          const run = await this.beginDeepResearchRun(userId, options?.jobId ?? null);
          subscription = run.subject.subscribe({
            next: (payload) => {
              if (!subscriber.closed) {
                subscriber.next({ data: JSON.stringify(payload) });
              }
            },
            error: (error) => {
              if (!subscriber.closed) {
                subscriber.error(error);
              }
            },
            complete: () => {
              settled = true;
              if (!subscriber.closed) {
                subscriber.complete();
              }
            },
          });
        } catch (error) {
          settled = true;
          if (error instanceof BadRequestException) {
            subscriber.next({
              data: JSON.stringify({ type: 'error', message: error.message }),
            });
            subscriber.complete();
            return;
          }
          subscriber.error(error);
        }
      };

      void attach();

      return () => {
        subscription?.unsubscribe();
        subscription = null;
        settled = true;
      };
    });
  }

  async ensureDeepResearchRun(
    userId: string,
    requestedJobId: string | null,
    options?: { restart?: boolean; createIfMissing?: boolean },
  ): Promise<{ jobId: string; status: DeepResearchRunStatus }> {
    const run = await this.beginDeepResearchRun(userId, requestedJobId, options);
    return { jobId: run.jobId, status: run.status };
  }

  private async beginDeepResearchRun(
    userId: string,
    requestedJobId: string | null,
    options?: { restart?: boolean; createIfMissing?: boolean },
  ): Promise<DeepResearchRun> {
    const baselineJob = await this.resolveActiveWritingDeskJob(userId, requestedJobId);
    const key = this.getDeepResearchRunKey(userId, baselineJob.jobId);
    const existing = this.deepResearchRuns.get(key);

    if (existing) {
      if (options?.restart) {
        if (existing.status === 'running') {
          throw new BadRequestException('Deep research is already running. Please wait for it to finish.');
        }
        if (existing.cleanupTimer) {
          clearTimeout(existing.cleanupTimer);
        }
        existing.subject.complete();
        this.deepResearchRuns.delete(key);
      } else {
        return existing;
      }
    } else if (options?.createIfMissing === false) {
      throw new BadRequestException('We could not resume deep research. Please start a new run.');
    }

    const subject = new ReplaySubject<DeepResearchStreamPayload>(DEEP_RESEARCH_RUN_BUFFER_SIZE);
    const run: DeepResearchRun = {
      key,
      userId,
      jobId: baselineJob.jobId,
      subject,
      status: 'running',
      startedAt: Date.now(),
      cleanupTimer: null,
      promise: null,
      responseId: null,
    };

    this.deepResearchRuns.set(key, run);

    run.promise = this.executeDeepResearchRun({ run, userId, baselineJob, subject }).catch((error) => {
      this.logger.error(`Deep research run encountered an unhandled error: ${(error as Error)?.message ?? error}`);
      subject.error(error);
    });

    return run;
  }

  private async executeDeepResearchRun(params: {
    run: DeepResearchRun;
    userId: string;
    baselineJob: ActiveWritingDeskJobResource;
    subject: ReplaySubject<DeepResearchStreamPayload>;
  }) {
    const { run, userId, baselineJob, subject } = params;
    let deductionApplied = false;
    let remainingCredits: number | null = null;
    let aggregatedText = '';
    let settled = false;
    let openAiStream: Stream<ResponseStreamEvent> | null = null;
    let responseId: string | null = run.responseId ?? null;

    const captureResponseId = async (candidate: unknown) => {
      if (!candidate || typeof candidate !== 'object') return;
      const id = (candidate as any)?.id;
      if (typeof id !== 'string') return;
      const trimmed = id.trim();
      if (!trimmed || trimmed === responseId) return;
      responseId = trimmed;
      run.responseId = trimmed;
      try {
        await this.persistDeepResearchResult(userId, baselineJob, {
          responseId: trimmed,
          status: 'running',
        });
      } catch (error) {
        this.logger.warn(
          `Failed to persist deep research response id for user ${userId}: ${(error as Error)?.message ?? error}`,
        );
      }
    };

    const send = (payload: DeepResearchStreamPayload) => {
      subject.next(payload);
    };

    const pushDelta = (next: string | null | undefined) => {
      if (typeof next !== 'string') return;
      if (next.length <= aggregatedText.length) {
        aggregatedText = next;
        return;
      }
      const incremental = next.slice(aggregatedText.length);
      aggregatedText = next;
      if (incremental.length > 0) {
        send({ type: 'delta', text: incremental });
      }
    };

    const mpName = await this.resolveUserMpName(userId);

    try {
      await this.persistDeepResearchStatus(userId, baselineJob, 'running');
    } catch (error) {
      this.logger.warn(
        `Failed to persist deep research status for user ${userId}: ${(error as Error)?.message ?? error}`,
      );
    }

    send({ type: 'status', status: 'starting' });

    try {
      const { credits } = await this.userCredits.deductFromMine(userId, DEEP_RESEARCH_CREDIT_COST);
      deductionApplied = true;
      remainingCredits = credits;
      send({ type: 'status', status: 'charged', remainingCredits: credits });

      const apiKey = this.config.get<string>('OPENAI_API_KEY');
      const model = this.config.get<string>('OPENAI_DEEP_RESEARCH_MODEL')?.trim() || 'o4-mini-deep-research';

      if (!apiKey) {
        const stub = this.buildDeepResearchStub(baselineJob, { mpName });
        for (const chunk of stub.chunks) {
          send({ type: 'delta', text: chunk });
          await this.delay(180);
        }
        await this.persistDeepResearchResult(userId, baselineJob, {
          content: stub.content,
          responseId: 'dev-stub',
          status: 'completed',
        });
        run.status = 'completed';
        settled = true;
        send({
          type: 'complete',
          content: stub.content,
          responseId: 'dev-stub',
          remainingCredits,
        });
        subject.complete();
        return;
      }

      const prompt = this.buildDeepResearchPrompt(baselineJob, { mpName });
      const client = await this.getOpenAiClient(apiKey);
      const requestExtras = this.buildDeepResearchRequestExtras(model);

      this.logger.log(
        `[writing-desk research] start ${JSON.stringify({
          userId,
          jobId: baselineJob.jobId,
          model,
          tools: requestExtras.tools?.length ?? 0,
        })}`,
      );

      openAiStream = (await client.responses.create({
        model,
        input: prompt,
        background: true,
        store: true,
        stream: true,
        ...requestExtras,
      })) as Stream<ResponseStreamEvent>;

      let lastSequenceNumber: number | null = null;
      let currentStream: Stream<ResponseStreamEvent> | null = openAiStream;
      let resumeAttempts = 0;

      while (currentStream) {
        let streamError: unknown = null;

        try {
          for await (const event of currentStream) {
            if (!event) continue;

            const sequenceNumber = (event as any)?.sequence_number;
            if (Number.isFinite(sequenceNumber)) {
              lastSequenceNumber = Number(sequenceNumber);
            }

            if ((event as any)?.response) {
              await captureResponseId((event as any).response);
            }

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
              case 'response.output_text.delta': {
                const snapshot = (event as any)?.snapshot;
                if (typeof snapshot === 'string' && snapshot.length > aggregatedText.length) {
                  pushDelta(snapshot);
                  break;
                }
                if (typeof event.delta === 'string' && event.delta.length > 0) {
                  pushDelta(aggregatedText + event.delta);
                }
                break;
              }
              case 'response.output_text.done':
                if (typeof event.text === 'string' && event.text.length > 0) {
                  pushDelta(event.text);
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
              case 'response.reasoning_summary.delta':
              case 'response.reasoning_summary.done':
              case 'response.reasoning_summary_part.added':
              case 'response.reasoning_summary_part.done':
              case 'response.reasoning_summary_text.delta':
              case 'response.reasoning_summary_text.done':
                send({ type: 'event', event: this.normaliseStreamEvent(event) });
                break;
              case 'response.failed':
              case 'response.incomplete': {
                const errorMessage = (event as any)?.error?.message ?? 'Deep research failed';
                throw new Error(errorMessage);
              }
              case 'response.completed': {
                const finalResponse = event.response;
                const resolvedResponseId = (finalResponse as any)?.id ?? responseId ?? null;
                if (resolvedResponseId && resolvedResponseId !== responseId) {
                  await captureResponseId(finalResponse);
                }
                const finalText = this.extractFirstText(finalResponse) ?? aggregatedText;
                await this.persistDeepResearchResult(userId, baselineJob, {
                  content: finalText,
                  responseId: resolvedResponseId,
                  status: 'completed',
                });
                run.status = 'completed';
                settled = true;
                send({
                  type: 'complete',
                  content: finalText,
                  responseId: resolvedResponseId,
                  remainingCredits,
                  usage: (finalResponse as any)?.usage ?? null,
                });
                subject.complete();
                return;
              }
              default:
                send({ type: 'event', event: this.normaliseStreamEvent(event) });
            }
          }
          break;
        } catch (error) {
          streamError = error;
        }

        if (!streamError) {
          break;
        }

        const isTransportFailure =
          streamError instanceof Error && /premature close/i.test(streamError.message);

        if (!isTransportFailure) {
          throw streamError instanceof Error
            ? streamError
            : new Error('Deep research stream failed with an unknown error');
        }

        if (!responseId) {
          this.logger.warn(
            `[writing-desk research] transport failure before response id available: ${
              streamError instanceof Error ? streamError.message : 'unknown error'
            }`,
          );
          break;
        }

        resumeAttempts += 1;
        const resumeCursor = lastSequenceNumber ?? null;
        this.logger.warn(
          `[writing-desk research] resume attempt ${resumeAttempts} for response ${responseId} starting after ${
            resumeCursor ?? 'start'
          }`,
        );

        try {
          currentStream = (await client.responses.stream(responseId, {
            starting_after: resumeCursor ?? undefined,
          })) as Stream<ResponseStreamEvent>;
          openAiStream = currentStream;
          this.logger.log(
            `[writing-desk research] resume attempt ${resumeAttempts} succeeded for response ${responseId}`,
          );
        } catch (resumeError) {
          this.logger.error(
            `[writing-desk research] resume attempt ${resumeAttempts} failed for response ${responseId}: ${
              resumeError instanceof Error ? resumeError.message : 'unknown error'
            }`,
          );
          break;
        }
      }

      if (!settled) {
        if (!responseId) {
          throw new Error('Deep research stream ended before a response id was available');
        }

        this.logger.warn(
          `[writing-desk research] stream ended early for response ${responseId}, polling for completion`,
        );

        const finalResponse = await this.waitForBackgroundResponseCompletion(client, responseId);
        const finalStatus = (finalResponse as any)?.status ?? 'completed';

        if (finalStatus === 'completed') {
          const finalText = this.extractFirstText(finalResponse) ?? aggregatedText;
          pushDelta(finalText);
          await this.persistDeepResearchResult(userId, baselineJob, {
            content: finalText,
            responseId,
            status: 'completed',
          });
          run.status = 'completed';
          settled = true;
          send({
            type: 'complete',
            content: finalText,
            responseId,
            remainingCredits,
            usage: (finalResponse as any)?.usage ?? null,
          });
          subject.complete();
        } else {
          const message = this.buildBackgroundFailureMessage(finalResponse, finalStatus);
          await this.persistDeepResearchResult(userId, baselineJob, {
            responseId,
            status: 'error',
          });
          run.status = 'error';
          settled = true;
          send({ type: 'error', message, remainingCredits });
          subject.complete();
        }
      }
    } catch (error) {
      this.logger.error(
        `[writing-desk research] failure ${error instanceof Error ? error.message : 'unknown'}`,
      );

      if (deductionApplied && !settled) {
        await this.refundCredits(userId, DEEP_RESEARCH_CREDIT_COST);
        remainingCredits =
          typeof remainingCredits === 'number'
            ? Math.round((remainingCredits + DEEP_RESEARCH_CREDIT_COST) * 100) / 100
            : null;
      }

      run.status = 'error';

      try {
        await this.persistDeepResearchStatus(userId, baselineJob, 'error');
      } catch (persistError) {
        this.logger.warn(
          `Failed to persist deep research error state for user ${userId}: ${(persistError as Error)?.message ?? persistError}`,
        );
      }

      const message =
        error instanceof BadRequestException
          ? error.message
          : 'Deep research failed. Please try again in a few moments.';

      send({
        type: 'error',
        message,
        remainingCredits,
      });
      subject.complete();
    } finally {
      if (!settled && openAiStream?.controller) {
        try {
          openAiStream.controller.abort();
        } catch (err) {
          this.logger.warn(
            `Failed to abort deep research stream: ${(err as Error)?.message ?? 'unknown error'}`,
          );
        }
      }

      this.scheduleRunCleanup(run);
    }
  }

  private getDeepResearchRunKey(userId: string, jobId: string): string {
    return `${userId}::${jobId}`;
  }

  private scheduleRunCleanup(run: DeepResearchRun) {
    if (run.cleanupTimer) {
      clearTimeout(run.cleanupTimer);
    }
    const timer = setTimeout(() => {
      this.deepResearchRuns.delete(run.key);
    }, DEEP_RESEARCH_RUN_TTL_MS);
    if (typeof (timer as any)?.unref === 'function') {
      (timer as any).unref();
    }
    run.cleanupTimer = timer as NodeJS.Timeout;
  }

  private async waitForBackgroundResponseCompletion(client: any, responseId: string) {
    const startedAt = Date.now();

    while (true) {
      try {
        const response = await client.responses.retrieve(responseId);
        const status = (response as any)?.status ?? null;

        if (!status || status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'incomplete') {
          return response;
        }

        if (Date.now() - startedAt >= BACKGROUND_POLL_TIMEOUT_MS) {
          throw new Error('Timed out waiting for deep research to finish');
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Timed out waiting')) {
          throw error;
        }
        if (Date.now() - startedAt >= BACKGROUND_POLL_TIMEOUT_MS) {
          throw new Error('Timed out waiting for deep research to finish');
        }
        this.logger.warn(
          `[writing-desk research] failed to retrieve background response ${responseId}: ${
            (error as Error)?.message ?? error
          }`,
        );
      }

      await this.delay(BACKGROUND_POLL_INTERVAL_MS);
    }
  }

  private buildBackgroundFailureMessage(response: any, status: string | null | undefined): string {
    const errorMessage = response?.error?.message;
    if (typeof errorMessage === 'string' && errorMessage.trim().length > 0) {
      return errorMessage.trim();
    }

    const incompleteReason = response?.incomplete_details?.reason;
    if (typeof incompleteReason === 'string' && incompleteReason.trim().length > 0) {
      return incompleteReason.trim();
    }

    switch (status) {
      case 'cancelled':
        return 'Deep research was cancelled.';
      case 'failed':
      case 'incomplete':
        return 'Deep research failed. Please try again in a few moments.';
      default:
        return 'Deep research finished without a usable result. Please try again in a few moments.';
    }
  }

  private async persistDeepResearchStatus(
    userId: string,
    fallback: ActiveWritingDeskJobResource,
    status: WritingDeskResearchStatus,
  ) {
    const latest = await this.writingDeskJobs.getActiveJobForUser(userId);
    const job = latest ?? fallback;
    const payload = this.buildResearchUpsertPayload(job, { status });
    await this.writingDeskJobs.upsertActiveJob(userId, payload);
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

  private buildDeepResearchPrompt(
    job: ActiveWritingDeskJobResource,
    options?: { mpName?: string | null },
  ): string {
    const sections: string[] = [
      'Research the issue described below and gather supporting facts, quotes, and statistics from credible, up-to-date sources.',
      'Provide a structured evidence report with inline citations for every key fact. Cite URLs or publication titles for each data point.',
      '',
      `Constituent description: ${this.normalisePromptField(job.form?.issueDescription, 'Not provided.')}`,
    ];

    const mpName = typeof options?.mpName === 'string' ? options.mpName.trim() : '';
    if (mpName) {
      sections.push(
        '',
        `Target MP: ${mpName}`,
        `Include a brief profile of ${mpName}, covering their background, priorities, and recent parliamentary activity relevant to this issue.`,
        `Identify persuasive angles that could help ${mpName} empathise with the constituent's situation (shared priorities, constituency impact, past statements, or committee work).`,
      );
    }

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

  private buildDeepResearchStub(
    job: ActiveWritingDeskJobResource,
    options?: { mpName?: string | null },
  ) {
    const mpName = typeof options?.mpName === 'string' ? options.mpName.trim() : '';
    const lines = [
      'DEV-STUB deep research summary (no external research was performed).',
      '',
      `• Issue summary: ${this.truncateForStub(job.form?.issueDescription)}`,
      '',
      'Suggested evidence to look for:',
      '1. Recent government or regulator statistics quantifying the scale of the issue.',
      '2. Quotes from reputable organisations, MPs, or investigative journalism covering the topic.',
      '3. Current policy commitments or funding schemes that relate to the requested outcome.',
      '',
      mpName
        ? `Target MP (${mpName}): Research their background, interests, and public statements to find empathy hooks.`
        : 'Target MP: Add notes about your MP to tailor the evidence and empathy angles.',
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
      `${lines[6]}\n${lines[7]}\n${lines[8]}\n${lines[9]}\n\n`,
      `${lines[11]}\n\n`,
      `${lines[13]}\n${lines[14]}\n${lines[15]}\n${lines[16]}`,
    ];

    return { content, chunks };
  }

  private truncateForStub(value: string | null | undefined): string {
    if (typeof value !== 'string') return 'Not provided.';
    const trimmed = value.trim();
    if (trimmed.length <= 160) return trimmed || 'Not provided.';
    return `${trimmed.slice(0, 157)}…`;
  }

  private buildDeepResearchRequestExtras(model?: string | null): DeepResearchRequestExtras {
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
        const normalisedSize = contextSize.toLowerCase();
        if (['low', 'medium', 'high'].includes(normalisedSize)) {
          tool.search_context_size = normalisedSize;
        }
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

    const extras: DeepResearchRequestExtras = {};
    if (tools.length > 0) {
      extras.tools = tools;
    }

    const maxToolCalls = this.parseOptionalInt(
      this.config.get<string>('OPENAI_DEEP_RESEARCH_MAX_TOOL_CALLS'),
    );
    if (typeof maxToolCalls === 'number' && maxToolCalls > 0) {
      extras.max_tool_calls = maxToolCalls;
    }

    const reasoningSummaryRaw = this.config
      .get<string>('OPENAI_DEEP_RESEARCH_REASONING_SUMMARY')
      ?.trim()
      .toLowerCase();
    const reasoningEffortRaw = this.config
      .get<string>('OPENAI_DEEP_RESEARCH_REASONING_EFFORT')
      ?.trim()
      .toLowerCase();

    let reasoningSummary: 'auto' | 'disabled' | null = 'auto';
    if (reasoningSummaryRaw === 'disabled') {
      reasoningSummary = 'disabled';
    } else if (reasoningSummaryRaw === 'auto') {
      reasoningSummary = 'auto';
    }

    const requestedEffort: 'low' | 'medium' | 'high' =
      reasoningEffortRaw === 'low' || reasoningEffortRaw === 'high'
        ? (reasoningEffortRaw as 'low' | 'high')
        : 'medium';

    const supportedEfforts = this.getSupportedReasoningEfforts(model);
    const fallbackEffort = supportedEfforts.includes('medium') ? 'medium' : supportedEfforts[0];
    const reasoningEffort = supportedEfforts.includes(requestedEffort)
      ? requestedEffort
      : fallbackEffort;

    if (requestedEffort !== reasoningEffort) {
      this.logger.warn(
        `[writing-desk research] reasoning effort "${requestedEffort}" is not supported for model "${
          model ?? 'unknown'
        }" – falling back to "${reasoningEffort}"`,
      );
    }

    extras.reasoning = {
      summary: reasoningSummary,
      effort: reasoningEffort,
    };

    return extras;
  }

  private getSupportedReasoningEfforts(model?: string | null): Array<'low' | 'medium' | 'high'> {
    if (!model) {
      return ['medium'];
    }

    const normalisedModel = model.trim().toLowerCase();
    if (normalisedModel === 'o4-mini-deep-research' || normalisedModel.startsWith('o4-mini-deep-research@')) {
      return ['medium'];
    }

    return ['low', 'medium', 'high'];
  }

  private async resolveUserMpName(userId: string): Promise<string | null> {
    try {
      const record = await this.userMp.getMine(userId);
      const rawName = (record as any)?.mp?.name;
      if (typeof rawName === 'string') {
        const trimmed = rawName.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
    } catch (error) {
      this.logger.warn(
        `[writing-desk research] failed to resolve MP name for user ${userId}: ${(error as Error)?.message ?? error}`,
      );
    }
    return null;
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
    result: {
      content?: string | null | undefined;
      responseId?: string | null | undefined;
      status?: WritingDeskResearchStatus | null | undefined;
    },
  ) {
    const latest = await this.writingDeskJobs.getActiveJobForUser(userId);
    const job = latest ?? fallback;
    const payload = this.buildResearchUpsertPayload(job, result);
    await this.writingDeskJobs.upsertActiveJob(userId, payload);
  }

  private buildResearchUpsertPayload(
    job: ActiveWritingDeskJobResource,
    result: {
      content?: string | null | undefined;
      responseId?: string | null | undefined;
      status?: WritingDeskResearchStatus | null | undefined;
    },
  ): UpsertActiveWritingDeskJobDto {
    const payload: UpsertActiveWritingDeskJobDto = {
      jobId: job.jobId,
      phase: job.phase,
      stepIndex: job.stepIndex,
      followUpIndex: job.followUpIndex,
      form: {
        issueDescription: job.form?.issueDescription ?? '',
      },
      followUpQuestions: Array.isArray(job.followUpQuestions) ? [...job.followUpQuestions] : [],
      followUpAnswers: Array.isArray(job.followUpAnswers) ? [...job.followUpAnswers] : [],
      notes: job.notes ?? undefined,
      responseId: job.responseId ?? undefined,
      researchStatus: job.researchStatus ?? 'idle',
    };

    const existingContent = this.normaliseResearchContent(job.researchContent ?? null);
    if (existingContent !== null) {
      payload.researchContent = existingContent;
    }

    const nextContent = this.normaliseResearchContent(result.content ?? null);
    if (nextContent !== null) {
      payload.researchContent = nextContent;
    } else if (!payload.researchContent) {
      payload.researchContent = undefined;
    }

    const existingResponseId = job.researchResponseId?.toString?.().trim?.();
    if (existingResponseId) {
      payload.researchResponseId = existingResponseId;
    }

    const researchResponseId = result.responseId?.toString?.().trim?.();
    if (researchResponseId) {
      payload.researchResponseId = researchResponseId;
    }

    if (result.status) {
      payload.researchStatus = result.status;
    }

    return payload;
  }

  private normaliseResearchContent(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const normalised = value.replace(/\r\n/g, '\n');
    return normalised.trim().length > 0 ? normalised : null;
  }

  private normaliseStreamEvent(event: ResponseStreamEvent): Record<string, unknown> {
    if (!event || typeof event !== 'object') {
      return { value: event ?? null };
    }

    try {
      return JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
    } catch (error) {
      const plain: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(event as unknown as Record<string, unknown>)) {
        plain[key] = value as unknown;
      }
      if (Object.prototype.hasOwnProperty.call(event, 'type') && !plain.type) {
        plain.type = (event as any).type;
      }
      if (Object.keys(plain).length === 0) {
        plain.serialised = String(event);
      }
      return plain;
    }
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
    const description = input.issueDescription?.trim?.() ?? '';
    const questions: string[] = [];

    if (description.length < 150) {
      questions.push("Could you share a little more detail about what has happened so far?");
    }

    if (!/\b(want|hope|expect|should|ask|seeking|goal)\b/i.test(description)) {
      questions.push('What action or outcome would you like your MP to push for?');
    }

    if (!/\b(family|neighbour|community|business|residents|my children|people)\b/i.test(description)) {
      questions.push('Who is being affected by this issue and how are they impacted?');
    }

    if (!/\b(since|for [0-9]+|weeks|months|years|when)\b/i.test(description)) {
      questions.push('How long has this been going on or when did it start?');
    }

    return questions.slice(0, 5);
  }
}
