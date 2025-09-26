import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WritingDeskIntakeDto } from './dto/writing-desk-intake.dto';
import { WritingDeskFollowUpDto } from './dto/writing-desk-follow-up.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private openaiClient: any | null = null;

  constructor(private readonly config: ConfigService) {}

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

  async generateWritingDeskFollowUps(input: WritingDeskIntakeDto) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const model = this.config.get<string>('OPENAI_FOLLOW_UP_MODEL')?.trim() || 'gpt-5-mini';

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
    };
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
