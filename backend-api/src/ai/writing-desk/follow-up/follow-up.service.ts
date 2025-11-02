import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { WritingDeskIntakeDto } from '../../dto/writing-desk-intake.dto';
import { WritingDeskFollowUpDto } from '../../dto/writing-desk-follow-up.dto';
import { UserCreditsService } from '../../../user-credits/user-credits.service';
import { OpenAiClientService } from '../../openai/openai-client.service';
import { extractFirstText, isOpenAiRelatedError } from '../../openai/openai.helpers';

@Injectable()
export class WritingDeskFollowUpService {
  private static readonly FOLLOW_UP_CREDIT_COST = 0.1;

  private readonly logger = new Logger(WritingDeskFollowUpService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly userCredits: UserCreditsService,
    private readonly openAiClient: OpenAiClientService,
  ) {}

  async generate(userId: string, input: WritingDeskIntakeDto) {
    const { credits: remainingAfterCharge } = await this.userCredits.deductFromMine(
      userId,
      WritingDeskFollowUpService.FOLLOW_UP_CREDIT_COST,
    );

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

      const client = await this.openAiClient.getClient(apiKey);

      const instructions = `You help constituents prepare to write letters to their Members of Parliament.

MANDATORY: ALL OUTPUT MUST USE BRITISH ENGLISH SPELLING. We are communicating exclusively with British MPs.

From the provided description, identify the most important gaps that stop you fully understanding the situation and what outcome the constituent wants.
Provide THREE concise follow-up questions as a baseline and never return fewer than three. Use each question to surface a distinct, high-importance gap. Only add a fourth or fifth if they reveal genuinely critical context that the first three cannot cover. Redundancy is worse than leaving a minor detail for later.
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
                  description: 'Between three and five clarifying follow-up questions for the user.',
                  minItems: 3,
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
        include: ['reasoning.encrypted_content'],
      });

      let parsed: { questions?: string[]; notes?: string } = {};
      const outputText = extractFirstText(response);
      if (outputText) {
        try {
          parsed = JSON.parse(outputText);
        } catch (error) {
          this.logger.warn(`Failed to parse follow-up response JSON: ${(error as Error).message}`);
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

      const usage = (response as any)?.usage ?? null;
      this.logger.log(
        `[writing-desk step1-usage] ${JSON.stringify({
          userId,
          model,
          responseId: bundle.responseId,
          usage,
        })}`,
      );

      this.openAiClient.recordSuccess();

      return {
        model,
        responseId: (response as any)?.id ?? null,
        followUpQuestions,
        notes: parsed.notes ?? null,
        remainingCredits: remainingAfterCharge,
      };
    } catch (error) {
      this.logger.error(
        `[writing-desk follow-up] failure ${
          error instanceof Error ? `${error.name}: ${error.message}` : (error as unknown as string)
        }`,
      );
      if (isOpenAiRelatedError(error)) {
        this.openAiClient.markError('generateWritingDeskFollowUps', error);
      }
      await this.refundCredits(userId, WritingDeskFollowUpService.FOLLOW_UP_CREDIT_COST);
      throw error;
    }
  }

  async record(input: WritingDeskFollowUpDto) {
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

  private buildStubFollowUps(input: WritingDeskIntakeDto) {
    const description = input.issueDescription?.trim?.() ?? '';
    const questions: string[] = [];

    if (description.length < 150) {
      questions.push('Could you share a little more detail about what has happened so far?');
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

    const fallbackQuestions = [
      'Is there anything the MP should avoid doing when they intervene?',
      'Have you already contacted anyone else about this? If so, what happened?',
      'What would a successful MP response look like for you?',
      'Are there key dates or deadlines the MP should be aware of?',
    ];

    for (const fallback of fallbackQuestions) {
      if (questions.length >= 3) {
        break;
      }
      if (!questions.includes(fallback)) {
        questions.push(fallback);
      }
    }

    return questions.slice(0, 5);
  }

  private async refundCredits(userId: string, amount: number) {
    try {
      await this.userCredits.addToMine(userId, amount);
    } catch (error) {
      this.logger.error(`Failed to refund credits for user ${userId}: ${(error as Error).message}`);
    }
  }
}

