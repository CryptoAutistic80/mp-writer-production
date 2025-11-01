import {
  BadRequestException,
  Injectable,
  Logger,
  MessageEvent,
  InternalServerErrorException,
  ServiceUnavailableException,
  OnModuleInit,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WritingDeskIntakeDto } from './dto/writing-desk-intake.dto';
import { WritingDeskFollowUpDto } from './dto/writing-desk-follow-up.dto';
import { TranscriptionDto, StreamingTranscriptionDto, TranscriptionModel, TranscriptionResponseFormat } from './dto/transcription.dto';
import { UserCreditsService } from '../user-credits/user-credits.service';
import { WritingDeskJobsService } from '../writing-desk-jobs/writing-desk-jobs.service';
import { UserMpService } from '../user-mp/user-mp.service';
import { UsersService } from '../users/users.service';
import { UserAddressService } from '../user-address-store/user-address.service';
import {
  ActiveWritingDeskJobResource,
  WritingDeskLetterStatus,
  WritingDeskLetterTone,
  WritingDeskResearchStatus,
  WRITING_DESK_LETTER_TONES,
} from '../writing-desk-jobs/writing-desk-jobs.types';
import { UpsertActiveWritingDeskJobDto } from '../writing-desk-jobs/dto/upsert-active-writing-desk-job.dto';
import { Observable, ReplaySubject, Subscription } from 'rxjs';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
import { StreamingStateService } from '../streaming-state/streaming-state.service';
import { StreamingRunState, StreamingRunKind } from '../streaming-state/streaming-state.types';
import {
  LetterContext,
  buildLetterPrompt,
  buildLetterResponseSchema,
  buildLetterSystemPrompt,
  getLetterToneRequestPrefix,
  getLetterToneSignOff,
} from './letter';

const FOLLOW_UP_CREDIT_COST = 0.1;
const DEEP_RESEARCH_CREDIT_COST = 0.7;
const LETTER_CREDIT_COST = 0.2;
const TRANSCRIPTION_CREDIT_COST = 0;

interface DeepResearchRequestExtras {
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

type ResponseStreamLike = AsyncIterable<ResponseStreamEvent> & {
  controller?: { abort: () => void };
};

const DEEP_RESEARCH_RUN_BUFFER_SIZE = 2000;
const DEEP_RESEARCH_RUN_TTL_MS = 5 * 60 * 1000;
const BACKGROUND_POLL_INTERVAL_MS = 2000;
const BACKGROUND_POLL_TIMEOUT_MS = 40 * 60 * 1000;
const RESEARCH_MAX_RESUME_ATTEMPTS = 10;
const LETTER_RUN_BUFFER_SIZE = 2000;
const LETTER_RUN_TTL_MS = 5 * 60 * 1000;
const LETTER_MAX_RESUME_ATTEMPTS = 10;
const STREAMING_RUN_ORPHAN_THRESHOLD_MS = 2 * 60 * 1000;
// Stream inactivity timeouts - max time between events before aborting
const LETTER_STREAM_INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const RESEARCH_STREAM_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const TRANSCRIPTION_STREAM_INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

type LetterStreamPayload =
  | { type: 'status'; status: string; remainingCredits?: number | null }
  | { type: 'event'; event: Record<string, unknown> }
  | { type: 'delta'; text: string }
  | { type: 'letter_delta'; html: string }
  | {
      type: 'complete';
      letter: LetterCompletePayload;
      remainingCredits: number | null;
    }
  | { type: 'error'; message: string; remainingCredits?: number | null };

interface WritingDeskLetterResult {
  mp_name: string;
  mp_address_1: string;
  mp_address_2: string;
  mp_city: string;
  mp_county: string;
  mp_postcode: string;
  date: string;
  subject_line_html: string;
  letter_content: string;
  sender_name: string;
  sender_address_1: string;
  sender_address_2: string;
  sender_address_3: string;
  sender_city: string;
  sender_county: string;
  sender_postcode: string;
  sender_phone: string;
  references: string[];
}

interface LetterCompletePayload {
  mpName: string;
  mpAddress1: string;
  mpAddress2: string;
  mpCity: string;
  mpCounty: string;
  mpPostcode: string;
  date: string;
  subjectLineHtml: string;
  letterContent: string;
  senderName: string;
  senderAddress1: string;
  senderAddress2: string;
  senderAddress3: string;
  senderCity: string;
  senderCounty: string;
  senderPostcode: string;
  senderTelephone: string;
  references: string[];
  responseId: string | null;
  tone: WritingDeskLetterTone;
  rawJson: string;
}

type LetterRunStatus = 'running' | 'completed' | 'error';

interface LetterRun {
  key: string;
  userId: string;
  jobId: string;
  tone: WritingDeskLetterTone;
  subject: ReplaySubject<LetterStreamPayload>;
  status: LetterRunStatus;
  startedAt: number;
  cleanupTimer: NodeJS.Timeout | null;
  promise: Promise<void> | null;
  responseId: string | null;
  remainingCredits: number | null;
}

interface LetterDocumentInput {
  mpName?: string | null;
  mpAddress1?: string | null;
  mpAddress2?: string | null;
  mpCity?: string | null;
  mpCounty?: string | null;
  mpPostcode?: string | null;
  date?: string | null;
  subjectLineHtml?: string | null;
  letterContentHtml?: string | null;
  senderName?: string | null;
  senderAddress1?: string | null;
  senderAddress2?: string | null;
  senderAddress3?: string | null;
  senderCity?: string | null;
  senderCounty?: string | null;
  senderPostcode?: string | null;
  senderTelephone?: string | null;
  references?: string[] | null;
}



@Injectable()
export class AiService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AiService.name);
  private openaiClient: any | null = null;
  private openaiClientCreatedAt: number | null = null;
  private openaiClientErrorCount: number = 0;
  private readonly deepResearchRuns = new Map<string, DeepResearchRun>();
  private readonly letterRuns = new Map<string, LetterRun>();
  private readonly instanceId: string;
  private cleanupSweepInterval: NodeJS.Timeout | null = null;
  
  private static readonly CLIENT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
  private static readonly CLIENT_MAX_ERRORS = 5;

  constructor(
    private readonly config: ConfigService,
    private readonly userCredits: UserCreditsService,
    private readonly writingDeskJobs: WritingDeskJobsService,
    private readonly userMp: UserMpService,
    private readonly users: UsersService,
    private readonly userAddress: UserAddressService,
    private readonly streamingState: StreamingStateService,
  ) {
    this.instanceId = this.streamingState.getInstanceId();
  }

  async onModuleInit() {
    await this.recoverStaleStreamingRuns();
    this.startCleanupSweep();
  }

  onModuleDestroy() {
    if (this.cleanupSweepInterval) {
      clearInterval(this.cleanupSweepInterval);
      this.cleanupSweepInterval = null;
    }
  }

  async onApplicationShutdown(signal?: string) {
    this.logger.log(`Graceful shutdown triggered (signal: ${signal ?? 'unknown'}), draining streaming operations...`);
    
    try {
      // Stop periodic cleanup sweep
      if (this.cleanupSweepInterval) {
        clearInterval(this.cleanupSweepInterval);
        this.cleanupSweepInterval = null;
      }

      // Get all active runs from Redis
      const allRuns = await this.streamingState.listAllRuns();
      const activeRuns = allRuns.filter(run => run.status === 'running' && run.instanceId === this.instanceId);
      
      this.logger.log(`Found ${activeRuns.length} active streaming runs to drain`);

      // Drain each active run
      const drainPromises = activeRuns.map(async (run) => {
        try {
          const runKey = run.runKey;
          
          // Try to abort the run in local memory maps
          const localRun = run.type === 'deep_research' 
            ? this.deepResearchRuns.get(runKey)
            : this.letterRuns.get(runKey);
          
          if (localRun) {
            // Abort OpenAI controller if exists
            // Note: The streaming operations store controller references in promises
            // We'll mark the run as cancelled in Redis and let existing cleanup handle it
            
            // Update status to cancelled in Redis
            await this.streamingState.updateRun(run.type, runKey, { status: 'cancelled' });
            
            this.logger.log(`Cancelled ${run.type} run: ${runKey}`);
          } else {
            // Run exists in Redis but not in local memory - mark as cancelled
            await this.streamingState.updateRun(run.type, runKey, { status: 'cancelled' });
            this.logger.log(`Marked orphaned ${run.type} run as cancelled: ${runKey}`);
          }
        } catch (error) {
          this.logger.warn(`Failed to drain run ${run.runKey}: ${(error as Error)?.message ?? error}`);
        }
      });

      await Promise.allSettled(drainPromises);
      
      this.logger.log('Streaming operations drained successfully');
    } catch (error) {
      this.logger.error(`Error during streaming drain: ${(error as Error)?.message ?? error}`);
    }
  }

  /**
   * Periodic sweep to remove stale Map entries as a safety net
   * Prevents memory leaks if cleanup timers fail or are not scheduled
   */
  private startCleanupSweep() {
    const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // Every 10 minutes
    // Use longer threshold for letter runs (typically complete in < 5 min)
    const LETTER_STALE_THRESHOLD_MS = LETTER_RUN_TTL_MS + (2 * 60 * 1000); // 7 minutes
    // Use much longer threshold for research runs (can take up to 40 min)
    const RESEARCH_STALE_THRESHOLD_MS = BACKGROUND_POLL_TIMEOUT_MS + (5 * 60 * 1000); // 45 minutes

    this.cleanupSweepInterval = setInterval(() => {
      const now = Date.now();
      let cleanedLetter = 0;
      let cleanedResearch = 0;

      // Sweep letter runs - only remove if completed/errored AND old enough
      for (const [key, run] of this.letterRuns.entries()) {
        const age = now - run.startedAt;
        const isStale = age > LETTER_STALE_THRESHOLD_MS;
        const isTerminated = run.status === 'completed' || run.status === 'error';
        
        if (isStale && isTerminated) {
          this.letterRuns.delete(key);
          cleanedLetter++;
          void this.clearStreamingRun('letter', key).catch((err) => {
            this.logger.warn(`Failed to clear stale letter run ${key}: ${(err as Error)?.message}`);
          });
        }
      }

      // Sweep deep research runs - longer threshold since they can run 30+ minutes
      for (const [key, run] of this.deepResearchRuns.entries()) {
        const age = now - run.startedAt;
        const isStale = age > RESEARCH_STALE_THRESHOLD_MS;
        const isTerminated = run.status === 'completed' || run.status === 'error';
        
        if (isStale && isTerminated) {
          this.deepResearchRuns.delete(key);
          cleanedResearch++;
          void this.clearStreamingRun('deep_research', key).catch((err) => {
            this.logger.warn(`Failed to clear stale research run ${key}: ${(err as Error)?.message}`);
          });
        }
      }

      if (cleanedLetter > 0 || cleanedResearch > 0) {
        this.logger.log(
          `Cleanup sweep removed ${cleanedLetter} letter runs and ${cleanedResearch} research runs`
        );
      }
    }, SWEEP_INTERVAL_MS);

    // Don't keep process alive just for cleanup sweeps
    if (typeof (this.cleanupSweepInterval as any)?.unref === 'function') {
      (this.cleanupSweepInterval as any).unref();
    }
  }

  private async getOpenAiClient(apiKey: string) {
    // Check if client needs recreation due to age or error count
    const now = Date.now();
    const needsRecreation =
      !this.openaiClient ||
      (this.openaiClientCreatedAt && now - this.openaiClientCreatedAt > AiService.CLIENT_MAX_AGE_MS) ||
      this.openaiClientErrorCount >= AiService.CLIENT_MAX_ERRORS;

    if (needsRecreation) {
      if (this.openaiClient) {
        const reason = 
          !this.openaiClientCreatedAt ? 'no timestamp' :
          (now - this.openaiClientCreatedAt > AiService.CLIENT_MAX_AGE_MS) ? 'age limit (30 minutes)' :
          `error count (${this.openaiClientErrorCount})`;
        this.logger.log(`Recreating OpenAI client due to: ${reason}`);
      }
      const { default: OpenAI } = await import('openai');
      this.openaiClient = new OpenAI({
        apiKey,
        timeout: 60000, // 60 seconds - accommodates streaming operations
        maxRetries: 3,
      });
      this.openaiClientCreatedAt = now;
      this.openaiClientErrorCount = 0;
    }
    
    return this.openaiClient;
  }

  private handleOpenAiError(error: any, context: string): never {
    this.openaiClientErrorCount++;
    const errorMessage = error?.message || 'unknown error';
    this.logger.error(`OpenAI error in ${context}: ${errorMessage} (error count: ${this.openaiClientErrorCount})`);
    
    if (this.openaiClientErrorCount >= AiService.CLIENT_MAX_ERRORS) {
      this.logger.warn(`OpenAI client will be recreated on next call due to ${this.openaiClientErrorCount} consecutive errors`);
    }
    
    throw error;
  }

  private handleOpenAiSuccess() {
    // Reset error count on successful operation
    if (this.openaiClientErrorCount > 0) {
      this.logger.log(`OpenAI client recovered after ${this.openaiClientErrorCount} previous errors`);
      this.openaiClientErrorCount = 0;
    }
  }

  /**
   * Wraps an async iterable stream with inactivity timeout protection.
   * If no events are received within the specified timeout period, the onTimeout
   * callback is invoked and iteration stops.
   */
  private async* createStreamWithTimeout<T>(
    stream: AsyncIterable<T>,
    timeoutMs: number,
    onTimeout: () => void,
  ): AsyncGenerator<T, void, unknown> {
    let lastEventTime = Date.now();
    let timeoutTriggered = false;
    let timedOut = false;

    // Start a timer that checks for inactivity
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - lastEventTime;
      if (elapsed >= timeoutMs && !timeoutTriggered) {
        timeoutTriggered = true;
        timedOut = true;
        clearInterval(checkInterval);
        onTimeout();
      }
    }, 1000); // Check every second
    if (typeof (checkInterval as any)?.unref === 'function') {
      (checkInterval as any).unref();
    }

    try {
      for await (const event of stream) {
        lastEventTime = Date.now(); // Reset timeout on each event
        
        // If we timed out in the previous iteration, stop yielding
        if (timedOut) {
          break;
        }

        yield event;
      }
    } catch (error) {
      // Re-throw errors, but if timeout triggered, mark as timed out
      if (timeoutTriggered) {
        timedOut = true;
      }
      throw error;
    } finally {
      clearInterval(checkInterval);
    }
  }

  private isRecoverableTransportError(error: unknown): boolean {
    if (!error) {
      return false;
    }

    const candidate = error as { message?: unknown; code?: unknown; name?: unknown };

    if (candidate instanceof Error) {
      if (candidate.name === 'AbortError' || candidate.name === 'TimeoutError') {
        return true;
      }
    }

    const message = typeof candidate?.message === 'string' ? candidate.message.toLowerCase() : '';
    const code = typeof candidate?.code === 'string' ? candidate.code.toUpperCase() : '';

    if (code) {
      const recoverableCodes = ['ECONNRESET', 'ECONNABORTED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND'];
      if (recoverableCodes.includes(code)) {
        return true;
      }
    }

    if (message) {
      const recoverablePhrases = [
        'premature close',
        'socket hang up',
        'fetch failed',
        'connection reset',
        'connection closed',
        'reset by peer',
        'connection aborted',
        'request aborted',
        'http/2 stream closed',
        'underlying socket was closed',
        'server hung up',
        'timed out',
      ];
      if (recoverablePhrases.some((phrase) => message.includes(phrase))) {
        return true;
      }
    }

    return false;
  }

  private isOpenAiResponseMissingError(error: unknown, responseId?: string | null): boolean {
    if (!error) {
      return false;
    }

    const candidate = error as { status?: unknown; message?: unknown; error?: { message?: unknown } };
    const status =
      typeof candidate?.status === 'number'
        ? candidate.status
        : typeof candidate?.status === 'string'
          ? Number(candidate.status)
          : null;
    const message =
      typeof candidate?.message === 'string'
        ? candidate.message
        : typeof candidate?.error?.message === 'string'
          ? candidate.error.message
          : '';

    if (status !== 404) {
      return false;
    }

    if (!message) {
      return false;
    }

    if (!message.toLowerCase().includes('response') || !message.toLowerCase().includes('not found')) {
      return false;
    }

    if (responseId && !message.includes(responseId)) {
      return false;
    }

    return true;
  }

  private resolveTranscriptionModel(modelFromRequest?: TranscriptionModel): TranscriptionModel {
    if (modelFromRequest) {
      return modelFromRequest;
    }

    const configuredModel = this.config.get<string>('OPENAI_TRANSCRIPTION_MODEL')?.trim();
    const allowedModels = Object.values(TranscriptionModel) as string[];

    if (configuredModel && allowedModels.includes(configuredModel)) {
      return configuredModel as TranscriptionModel;
    }

    if (configuredModel && !allowedModels.includes(configuredModel)) {
      this.logger.warn(
        `Unsupported OPENAI_TRANSCRIPTION_MODEL "${configuredModel}" provided. Falling back to "${TranscriptionModel.GPT_4O_MINI_TRANSCRIBE}".`,
      );
    }

    return TranscriptionModel.GPT_4O_MINI_TRANSCRIBE;
  }

  async generate(input: { prompt: string; model?: string }) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const model = input.model || this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    if (!apiKey) {
      // In dev without key, return a stub so flows work
      return { content: `DEV-STUB: ${input.prompt.slice(0, 120)}...` };
    }
    try {
      const client = await this.getOpenAiClient(apiKey);
      const resp = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: input.prompt }],
        temperature: 0.7,
      });
      this.handleOpenAiSuccess();
      const content = resp.choices?.[0]?.message?.content ?? '';
      return { content };
    } catch (error) {
      this.handleOpenAiError(error, 'generate');
    }
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
      const usage = (response as any)?.usage ?? null;
      this.logger.log(
        `[writing-desk step1-usage] ${JSON.stringify({
          userId,
          model,
          responseId: bundle.responseId,
          usage,
        })}`,
      );

      this.handleOpenAiSuccess();
      return {
        model,
        responseId: (response as any)?.id ?? null,
        followUpQuestions,
        notes: parsed.notes ?? null,
        remainingCredits: remainingAfterCharge,
      };
    } catch (error) {
      this.logger.error(
        `[writing-desk letter] failure ${
          error instanceof Error ? `${error.name}: ${error.message}` : (error as unknown as string)
        }`,
      );
      // Check if this is an OpenAI-related error
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMsg = (error as Error).message?.toLowerCase() || '';
        if (errorMsg.includes('openai') || errorMsg.includes('api key') || errorMsg.includes('network') || errorMsg.includes('timeout')) {
          this.openaiClientErrorCount++;
          this.logger.warn(`OpenAI error detected in generateWritingDeskFollowUps (error count: ${this.openaiClientErrorCount})`);
          if (this.openaiClientErrorCount >= AiService.CLIENT_MAX_ERRORS) {
            this.logger.warn(`OpenAI client will be recreated on next call due to ${this.openaiClientErrorCount} consecutive errors`);
          }
        }
      }
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
      let _settled = false;

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
              _settled = true;
              if (!subscriber.closed) {
                subscriber.complete();
              }
            },
          });
        } catch (error) {
          _settled = true;
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

      attach().catch((error) => {
        // Handle any unhandled promise rejections from attach()
        // This should never happen due to try-catch above, but provides defense-in-depth
        if (!_settled && !subscriber.closed) {
          subscriber.error(error);
        }
      });

      return () => {
        subscription?.unsubscribe();
        subscription = null;
        _settled = true;
      };
    });
  }

  streamWritingDeskLetter(
    userId: string | null | undefined,
    options?: { jobId?: string | null; tone?: string | null; resume?: boolean | null },
  ): Observable<MessageEvent> {
    if (!userId) {
      throw new BadRequestException('User account required');
    }

    const resume = options?.resume === true;

    return new Observable<MessageEvent>((subscriber) => {
      let subscription: Subscription | null = null;

      const attach = async () => {
        try {
          const run = await this.beginLetterRun(userId, options?.jobId ?? null, {
            tone: options?.tone ?? null,
            createIfMissing: !resume,
          });

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
              if (!subscriber.closed) {
                subscriber.complete();
              }
            },
          });
        } catch (error) {
          if (error instanceof BadRequestException) {
            if (!subscriber.closed) {
              subscriber.next({ data: JSON.stringify({ type: 'error', message: error.message }) });
              subscriber.complete();
            }
            return;
          }
          if (!subscriber.closed) {
            subscriber.error(error);
          }
        }
      };

      attach().catch((error) => {
        // Handle any unhandled promise rejections from attach()
        // This should never happen due to try-catch above, but provides defense-in-depth
        if (!subscriber.closed) {
          subscriber.error(error);
        }
      });

      return () => {
        if (subscription) {
          subscription.unsubscribe();
          subscription = null;
        }
      };
    });
  }

  async ensureLetterRun(
    userId: string,
    requestedJobId: string | null,
    options?: { tone?: string | null; restart?: boolean; createIfMissing?: boolean },
  ): Promise<{ jobId: string; status: LetterRunStatus }> {
    const run = await this.beginLetterRun(userId, requestedJobId, options);
    return { jobId: run.jobId, status: run.status };
  }

  private async beginLetterRun(
    userId: string,
    requestedJobId: string | null,
    options?: { tone?: string | null; restart?: boolean; createIfMissing?: boolean },
  ): Promise<LetterRun> {
    const baselineJob = await this.resolveActiveWritingDeskJob(userId, requestedJobId);
    const key = this.getLetterRunKey(userId, baselineJob.jobId);
    const existing = this.letterRuns.get(key);

    if (existing) {
      if (options?.restart) {
        if (existing.status === 'running') {
          throw new BadRequestException('Letter composition is already running. Please wait for it to finish.');
        }
        if (existing.cleanupTimer) {
          clearTimeout(existing.cleanupTimer);
        }
        existing.subject.complete();
        this.letterRuns.delete(key);
      } else {
        return existing;
      }
    } else {
      const persisted = await this.streamingState.getRun('letter', key);
      if (persisted) {
        if (persisted.responseId) {
          return this.resumeLetterRunFromState({
            persisted,
            userId,
            baselineJob,
          });
        }
        await this.handleOrphanedRun(persisted);
      } else if (options?.createIfMissing === false) {
        throw new BadRequestException('We could not resume letter composition. Please start a new letter.');
      }
    }

    const tone = this.normaliseLetterTone(options?.tone ?? baselineJob.letterTone ?? null);
    if (!tone) {
      throw new BadRequestException('Select a tone before composing the letter.');
    }

    const researchContent = this.normaliseResearchContent(baselineJob.researchContent ?? null);
    if (!researchContent) {
      throw new BadRequestException('Run deep research before composing the letter.');
    }

    const subject = new ReplaySubject<LetterStreamPayload>(LETTER_RUN_BUFFER_SIZE);
    const run: LetterRun = {
      key,
      userId,
      jobId: baselineJob.jobId,
      tone,
      subject,
      status: 'running',
      startedAt: Date.now(),
      cleanupTimer: null,
      promise: null,
      responseId: null,
      remainingCredits: null,
    };

    this.letterRuns.set(key, run);

    await this.registerStreamingRun({
      type: 'letter',
      runKey: key,
      userId,
      jobId: baselineJob.jobId,
      meta: { tone },
    });

    run.promise = this.executeLetterRun({
      run,
      userId,
      baselineJob,
      subject,
      researchContent,
    }).catch((error) => {
      this.logger.error(`Letter run encountered an unhandled error: ${(error as Error)?.message ?? error}`);
      subject.error(error);
    });

    return run;
  }

  private async executeLetterRun(params: {
    run: LetterRun;
    userId: string;
    baselineJob: ActiveWritingDeskJobResource;
    subject: ReplaySubject<LetterStreamPayload>;
    researchContent: string;
    resumeFromState?: { responseId: string | null; charged: boolean; remainingCredits: number | null };
  }) {
    const { run, userId, baselineJob, subject, researchContent, resumeFromState } = params;
    const heartbeat = this.createStreamingHeartbeat('letter', run.key);
    const tone = run.tone;
    let deductionApplied = false;
    let remainingCredits: number | null = resumeFromState?.remainingCredits ?? null;
    let jsonBuffer = '';
    let quietPeriodTimer: NodeJS.Timeout | null = null;
    let _settled = false;
    let lastPersistedContent: string | null = null;
    let lastPersistedAt = 0;
    let responseId: string | null = resumeFromState?.responseId ?? run.responseId ?? null;
    const trackedControllers: Array<{ abort: () => void }> = [];

    const send = (payload: LetterStreamPayload) => {
      subject.next(payload);
      heartbeat();
    };

    const persistProgressIfNeeded = async (html: string) => {
      const now = Date.now();
      const hasChanged = html !== lastPersistedContent;
      const shouldPersist = hasChanged && (now - lastPersistedAt > 5000); // Every 5 seconds

      if (shouldPersist) {
        try {
          await this.persistLetterState(userId, baselineJob, {
            status: 'generating',
            tone,
            content: html,
            responseId: run.responseId,
            json: jsonBuffer || null,
          });
          lastPersistedContent = html;
          lastPersistedAt = now;
        } catch (error) {
          this.logger.warn(
            `Failed to persist letter progress for user ${userId}: ${(error as Error)?.message ?? error}`,
          );
        }
      }
    };

    const captureResponseId = async (candidate: unknown) => {
      if (!candidate || typeof candidate !== 'object') {
        return;
      }

      const id = (candidate as any)?.id;
      if (typeof id !== 'string') {
        return;
      }

      const trimmed = id.trim();
      if (!trimmed || trimmed === responseId) {
        return;
      }

      responseId = trimmed;
      run.responseId = trimmed;
      heartbeat({ responseId: trimmed });

      try {
        await this.persistLetterState(userId, baselineJob, { responseId: trimmed, tone });
      } catch (error) {
        this.logger.warn(
          `Failed to persist letter response id for user ${userId}: ${(error as Error)?.message ?? error}`,
        );
      }

      await this.touchStreamingRun('letter', run.key, { responseId: trimmed });
    };

    try {
      if (resumeFromState?.responseId) {
        deductionApplied = resumeFromState.charged;
        remainingCredits = resumeFromState.remainingCredits ?? run.remainingCredits;
        run.remainingCredits = remainingCredits;
      } else {
        const { credits: creditsAfterCharge } = await this.userCredits.deductFromMine(userId, LETTER_CREDIT_COST);
        deductionApplied = true;
        remainingCredits = Math.round(creditsAfterCharge * 100) / 100;
        run.remainingCredits = remainingCredits;
        await this.touchStreamingRun('letter', run.key, {
          meta: { charged: true, remainingCredits },
        });
      }

      await this.persistLetterState(userId, baselineJob, {
        status: 'generating',
        tone,
        responseId: null,
        content: null,
        references: [],
        json: null,
      });

      send({ type: 'status', status: 'Composing your letter…', remainingCredits });
      heartbeat({ status: 'running', responseId: run.responseId });

      const apiKey = this.config.get<string>('OPENAI_API_KEY');
      const model = this.config.get<string>('OPENAI_LETTER_MODEL')?.trim() || 'gpt-5';
      const verbosity = this.normaliseLetterVerbosity(this.config.get<string>('OPENAI_LETTER_VERBOSITY'));
      const reasoningEffort = this.normaliseLetterReasoningEffort(
        model,
        this.config.get<string>('OPENAI_LETTER_REASONING_EFFORT'),
      );

      const context = await this.resolveLetterContext(userId);
      const prompt = buildLetterPrompt({ job: baselineJob, tone, context, research: researchContent });

      if (!apiKey) {
        const stub = this.buildStubLetter({ job: baselineJob, tone, context, research: researchContent });
        const stubDocument = this.buildLetterDocumentHtml({
          mpName: stub.mp_name,
          mpAddress1: stub.mp_address_1,
          mpAddress2: stub.mp_address_2,
          mpCity: stub.mp_city,
          mpCounty: stub.mp_county,
          mpPostcode: stub.mp_postcode,
          date: stub.date,
          subjectLineHtml: stub.subject_line_html,
          letterContentHtml: stub.letter_content,
          senderName: stub.sender_name,
          senderAddress1: stub.sender_address_1,
          senderAddress2: stub.sender_address_2,
          senderAddress3: stub.sender_address_3,
          senderCity: stub.sender_city,
          senderCounty: stub.sender_county,
          senderPostcode: stub.sender_postcode,
          senderTelephone: stub.sender_phone,
          references: stub.references,
        });
        const rawJson = JSON.stringify(stub);
        await this.persistLetterResult(userId, baselineJob, {
          status: 'completed',
          tone,
          responseId: 'dev-stub',
          content: stubDocument,
          references: stub.references ?? [],
          json: rawJson,
        });
        run.status = 'completed';
        _settled = true;
        send({ type: 'letter_delta', html: stubDocument });
        send({
          type: 'complete',
          letter: this.toLetterCompletePayload(
            { ...stub, letter_content: stubDocument },
            { responseId: 'dev-stub', tone, rawJson },
          ),
          remainingCredits,
        });
        await this.touchStreamingRun('letter', run.key, {
          status: 'completed',
          responseId: 'dev-stub',
          meta: { tone },
        });
        await this.clearStreamingRun('letter', run.key);
        subject.complete();
        
        // Clean up the quiet period timer
        if (quietPeriodTimer) {
          clearTimeout(quietPeriodTimer);
          quietPeriodTimer = null;
        }
        return;
      }

      const client = await this.getOpenAiClient(apiKey);
      const createLetterStreamFromPrompt = () =>
        client.responses.stream({
          model,
          input: [
            { role: 'system', content: [{ type: 'input_text', text: buildLetterSystemPrompt() }] },
            { role: 'user', content: [{ type: 'input_text', text: prompt }] },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'mp_letter',
              strict: true,
              schema: buildLetterResponseSchema(context, (value) => this.normaliseLetterTypography(value)),
            },
            verbosity,
          },
          reasoning: {
            effort: reasoningEffort,
            summary: 'auto',
          },
          tools: [],
          store: true,
          include: ['reasoning.encrypted_content'],
        }) as ResponseStreamLike;

      let openAiStream: ResponseStreamLike | null = null;
      let currentStream: ResponseStreamLike | null = null;
      let lastSequenceNumber: number | null = null;
      let lastCursor: string | null = null;
      let resumeAttempts = 0;
      let backgroundPollingNotified = false;
      if (responseId) {
        run.responseId = responseId;
      }

      const registerController = (streamCandidate: ResponseStreamLike | null) => {
        if (!streamCandidate) {
          return;
        }
        const controllerCandidate = (streamCandidate as any)?.controller;
        if (controllerCandidate && typeof controllerCandidate.abort === 'function') {
          trackedControllers.push(controllerCandidate);
        }
      };

      const resumeStatusMessages = [
        'Reconnecting to the drafting desk…',
        'Trying to resume the live letter feed…',
        'Dusting off the backup quill…',
        'Re-engaging the Westminster wordsmith…',
        'Coaxing the letter stream back online…',
        'Asking the parliamentary scribe to continue…',
      ];

      const notifyBackgroundPolling = () => {
        if (!backgroundPollingNotified) {
          send({ type: 'status', status: 'background_polling', remainingCredits });
          send({
            type: 'event',
            event: {
              type: 'quiet_period',
              message: 'The live stream hit a snag; finishing your letter in the background…',
            },
          });
          backgroundPollingNotified = true;
        }
        if (quietPeriodTimer) {
          clearTimeout(quietPeriodTimer);
          quietPeriodTimer = null;
        }
      };

      const attemptStreamResume = async (
        initialError: unknown,
      ): Promise<ResponseStreamLike | null> => {
        let latestError: unknown = initialError;

        while (true) {
          if (this.isOpenAiResponseMissingError(latestError, responseId)) {
            this.logger.warn(
              `[writing-desk letter] response ${responseId ?? 'unknown'} missing; starting a new streamed response`,
            );
            send({
              type: 'event',
              event: {
                type: 'resume_attempt',
                message: 'Recreating your live draft after the previous stream expired…',
                attempt: resumeAttempts + 1,
              },
            });
            responseId = null;
            run.responseId = null;
            lastSequenceNumber = null;
            lastCursor = null;
            resumeAttempts = 0;
            backgroundPollingNotified = false;
            return createLetterStreamFromPrompt();
          }

          if (!this.isRecoverableTransportError(latestError)) {
            throw latestError instanceof Error
              ? latestError
              : new Error('Letter composition stream failed with an unknown error');
          }

          if (!responseId) {
            this.logger.warn(
              `[writing-desk letter] transport failure before response id available: ${
                latestError instanceof Error ? latestError.message : 'unknown error'
              }`,
            );
            return null;
          }

          if (resumeAttempts >= LETTER_MAX_RESUME_ATTEMPTS) {
            this.logger.warn(
              `[writing-desk letter] resume attempt limit reached for response ${responseId}, switching to background polling`,
            );
            notifyBackgroundPolling();
            return null;
          }

          resumeAttempts += 1;
          const resumeCursor = lastCursor ?? (lastSequenceNumber != null ? String(lastSequenceNumber) : null);
          const resumeCursorLog = resumeCursor ?? (lastSequenceNumber ?? 'start');
          this.logger.warn(
            `[writing-desk letter] resume attempt ${resumeAttempts} for response ${responseId} starting after ${resumeCursorLog}`,
          );

          const randomMessage = resumeStatusMessages[Math.floor(Math.random() * resumeStatusMessages.length)];
          send({ type: 'event', event: { type: 'resume_attempt', message: randomMessage, attempt: resumeAttempts } });

          if (resumeAttempts > 1) {
            const backoffMs = Math.min(1000 * 2 ** (resumeAttempts - 1), 5000);
            const jitter = Math.floor(Math.random() * 300);
            await this.delay(backoffMs + jitter);
          }

          const resumeParams: { response_id: string; after?: string; event_id?: string } = {
            response_id: responseId,
          };

          if (resumeCursor) {
            resumeParams.after = resumeCursor;
            resumeParams.event_id = resumeCursor;
          }

          try {
            const resumed = client.responses.stream(resumeParams) as ResponseStreamLike;
            this.logger.log(
              `[writing-desk letter] resume attempt ${resumeAttempts} succeeded for response ${responseId}`,
            );
            return resumed;
          } catch (resumeError) {
            if (this.isOpenAiResponseMissingError(resumeError, responseId)) {
              this.logger.warn(
                `[writing-desk letter] response ${responseId ?? 'unknown'} missing on resume; starting a fresh letter stream`,
              );
              send({
                type: 'event',
                event: {
                  type: 'resume_attempt',
                  message: 'The live draft expired, starting a fresh stream with your latest details…',
                  attempt: resumeAttempts,
                },
              });
              responseId = null;
              run.responseId = null;
              lastSequenceNumber = null;
              lastCursor = null;
              resumeAttempts = 0;
              backgroundPollingNotified = false;
              return createLetterStreamFromPrompt();
            }
            this.logger.error(
              `[writing-desk letter] resume attempt ${resumeAttempts} failed for response ${responseId}: ${
                resumeError instanceof Error ? resumeError.message : 'unknown error'
              }`,
            );
            latestError = resumeError;
            continue;
          }
        }
      };

      openAiStream = resumeFromState?.responseId
        ? (client.responses.stream({ response_id: resumeFromState.responseId }) as ResponseStreamLike)
        : createLetterStreamFromPrompt();

      currentStream = openAiStream;
      registerController(currentStream);

      // Set up periodic status updates during quiet periods
      const startQuietPeriodTimer = () => {
        if (quietPeriodTimer) {
          clearTimeout(quietPeriodTimer);
          quietPeriodTimer = null;
        }
        const timer = setTimeout(() => {
          const quietStatusMessages = [
            'Drafting a persuasive opening…',
            'Cross-referencing your evidence with parliamentary procedures…',
            'Ensuring the tone matches your chosen style…',
            'Polishing the argument structure…',
            'Having a quick word with the parliamentary style guide…',
            'Making sure every fact is properly cited…',
            'Tailoring the content to your MP\'s interests…',
            'Checking that the letter flows naturally…',
            'Fine-tuning the closing paragraph…',
            'Ensuring all the key points are covered…',
          ];
          const randomMessage = quietStatusMessages[Math.floor(Math.random() * quietStatusMessages.length)];
          send({ type: 'event', event: { type: 'quiet_period', message: randomMessage } });
          quietPeriodTimer = null;
          startQuietPeriodTimer(); // Reset the timer
        }, 5000); // 5 seconds of inactivity
        if (typeof (timer as any)?.unref === 'function') {
          (timer as any).unref();
        }
        quietPeriodTimer = timer as NodeJS.Timeout;
      };

      startQuietPeriodTimer();

      while (currentStream) {
        let streamError: unknown = null;
        const streamForIteration = currentStream;

        try {
          const timeoutWrappedStream = this.createStreamWithTimeout(
            streamForIteration,
            LETTER_STREAM_INACTIVITY_TIMEOUT_MS,
            () => {
              this.logger.warn(`[letter] Stream inactivity timeout for job ${baselineJob.jobId}`);
              const ctrl = (streamForIteration as any)?.controller;
              if (ctrl && typeof ctrl.abort === 'function') {
                ctrl.abort();
              }
            },
          );

          for await (const event of timeoutWrappedStream) {
            if (quietPeriodTimer) {
              clearTimeout(quietPeriodTimer);
              quietPeriodTimer = null;
            }
            startQuietPeriodTimer();

            const sequenceNumber = (event as any)?.sequence_number;
            if (Number.isFinite(sequenceNumber)) {
              lastSequenceNumber = Number(sequenceNumber);
            }

            const eventCursor =
              typeof (event as any)?.id === 'string'
                ? (event as any).id
                : typeof (event as any)?.cursor === 'string'
                  ? (event as any).cursor
                  : null;
            if (eventCursor) {
              lastCursor = eventCursor;
            }

            if (typeof (event as any)?.response_id === 'string') {
              await captureResponseId({ id: (event as any).response_id });
            }

            if ((event as any)?.response) {
              await captureResponseId((event as any).response);
            }

            const normalised = this.normaliseStreamEvent(event);
            const eventType = typeof normalised.type === 'string' ? normalised.type : null;

            if (eventType?.startsWith('response.reasoning')) {
              send({ type: 'event', event: normalised });
              continue;
            }

            if (eventType === 'response.output_text.delta') {
              const delta = this.extractOutputTextDelta(normalised);
              if (delta) {
                jsonBuffer += delta;
                send({ type: 'delta', text: delta });
                const preview = this.extractLetterPreview(jsonBuffer);
                if (preview !== null) {
                  const subjectPreview = this.extractSubjectLinePreview(jsonBuffer);
                  const previewDocument = this.buildLetterDocumentHtml({
                    mpName: context.mpName,
                    mpAddress1: context.mpAddress1,
                    mpAddress2: context.mpAddress2,
                    mpCity: context.mpCity,
                    mpCounty: context.mpCounty,
                    mpPostcode: context.mpPostcode,
                    date: context.today,
                    subjectLineHtml: subjectPreview,
                    letterContentHtml: preview,
                    senderName: context.senderName,
                    senderAddress1: context.senderAddress1,
                    senderAddress2: context.senderAddress2,
                    senderAddress3: context.senderAddress3,
                    senderCity: context.senderCity,
                    senderCounty: context.senderCounty,
                    senderPostcode: context.senderPostcode,
                    senderTelephone: context.senderTelephone,
                    references: this.extractReferencesFromJson(jsonBuffer),
                  });
                  send({ type: 'letter_delta', html: previewDocument });
                  await persistProgressIfNeeded(previewDocument);
                }
              }
              continue;
            }

            if (eventType === 'response.output_text.done') {
              const preview = this.extractLetterPreview(jsonBuffer);
              if (preview !== null) {
                const subjectPreview = this.extractSubjectLinePreview(jsonBuffer);
                const previewDocument = this.buildLetterDocumentHtml({
                  mpName: context.mpName,
                  mpAddress1: context.mpAddress1,
                  mpAddress2: context.mpAddress2,
                  mpCity: context.mpCity,
                  mpCounty: context.mpCounty,
                  mpPostcode: context.mpPostcode,
                  date: context.today,
                  subjectLineHtml: subjectPreview,
                  letterContentHtml: preview,
                  senderName: context.senderName,
                  senderAddress1: context.senderAddress1,
                  senderAddress2: context.senderAddress2,
                  senderAddress3: context.senderAddress3,
                  senderCity: context.senderCity,
                  senderCounty: context.senderCounty,
                  senderPostcode: context.senderPostcode,
                  senderTelephone: context.senderTelephone,
                  references: this.extractReferencesFromJson(jsonBuffer),
                });
                send({ type: 'letter_delta', html: previewDocument });
                await persistProgressIfNeeded(previewDocument);
              }
              continue;
            }

            if (eventType === 'response.completed') {
              await captureResponseId((normalised as any)?.response ?? null);
              const resolvedResponseId =
                typeof (normalised as any)?.response?.id === 'string'
                  ? (normalised as any).response.id
                  : responseId;
              const usage = (normalised as any)?.response?.usage ?? null;
              this.logger.log(
                `[writing-desk letter-usage] ${JSON.stringify({
                  userId,
                  jobId: baselineJob.jobId,
                  model,
                  tone,
                  responseId: resolvedResponseId ?? responseId ?? run.responseId,
                  usage,
                })}`,
              );
              const finalText = this.extractFirstText((normalised as any)?.response) ?? jsonBuffer;
              const parsed = this.parseLetterResult(finalText);
              const merged = this.mergeLetterResultWithContext(parsed, context);
              const references = Array.isArray(merged.references)
                ? merged.references.map((ref) => {
                    try {
                      return decodeURIComponent(ref);
                    } catch {
                      return ref;
                    }
                  })
                : [];
              const finalDocument = this.buildLetterDocumentHtml({
                mpName: merged.mp_name,
                mpAddress1: merged.mp_address_1,
                mpAddress2: merged.mp_address_2,
                mpCity: merged.mp_city,
                mpCounty: merged.mp_county,
                mpPostcode: merged.mp_postcode,
                date: merged.date,
                subjectLineHtml: merged.subject_line_html,
                letterContentHtml: merged.letter_content,
                senderName: merged.sender_name,
                senderAddress1: merged.sender_address_1,
                senderAddress2: merged.sender_address_2,
                senderAddress3: merged.sender_address_3,
                senderCity: merged.sender_city,
                senderCounty: merged.sender_county,
                senderPostcode: merged.sender_postcode,
                senderTelephone: merged.sender_phone,
                references,
              });

              const resolvedId = resolvedResponseId ?? responseId ?? null;
              await this.persistLetterResult(userId, baselineJob, {
                status: 'completed',
                tone,
                responseId: resolvedId,
                content: finalDocument,
                references,
                json: finalText,
              });

              run.status = 'completed';
              _settled = true;
              responseId = resolvedId;
              send({ type: 'letter_delta', html: finalDocument });
              send({
                type: 'complete',
                letter: this.toLetterCompletePayload(
                  { ...merged, letter_content: finalDocument },
                  { responseId: resolvedId, tone, rawJson: finalText },
                ),
                remainingCredits,
              });
              await this.touchStreamingRun('letter', run.key, {
                status: 'completed',
                responseId: resolvedId ?? run.responseId ?? null,
              });
              this.handleOpenAiSuccess();
              subject.complete();

              if (quietPeriodTimer) {
                clearTimeout(quietPeriodTimer);
                quietPeriodTimer = null;
              }
              return;
            }

            if (eventType === 'response.error' || eventType === 'response.failed') {
              const message =
                typeof (normalised as any)?.error?.message === 'string'
                  ? ((normalised as any).error.message as string)
                  : 'Letter composition failed. Please try again in a few moments.';

              this.logger.error(
                `LETTER_COMPOSITION_RESPONSE_ERROR: ${message}`,
                {
                  errorType: 'LETTER_COMPOSITION_RESPONSE_ERROR',
                  userId,
                  jobId: baselineJob.jobId,
                  tone,
                  responseId: run.responseId,
                  eventType,
                  errorDetails: (normalised as any)?.error || 'No error details available',
                  timestamp: new Date().toISOString(),
                  service: 'writing-desk-letter-composition'
                }
              );

              throw new Error(message);
            }
          }

          break;
        } catch (error) {
          streamError = error;
        }

        if (quietPeriodTimer) {
          clearTimeout(quietPeriodTimer);
          quietPeriodTimer = null;
        }

        const resumedStream = await attemptStreamResume(streamError);
        if (!resumedStream) {
          currentStream = null;
          break;
        }
        currentStream = resumedStream;
        registerController(currentStream);
        startQuietPeriodTimer();
      }

      if (_settled) {
        return;
      }

      if (!responseId) {
        this.logger.error(
          `LETTER_COMPOSITION_UNEXPECTED_END: Letter composition ended unexpectedly`,
          {
            errorType: 'LETTER_COMPOSITION_UNEXPECTED_END',
            userId,
            jobId: baselineJob.jobId,
            tone,
            responseId: run.responseId,
            timestamp: new Date().toISOString(),
            service: 'writing-desk-letter-composition',
            runDuration: Date.now() - run.startedAt,
            jsonBufferLength: jsonBuffer?.length || 0,
            lastPersistedContentLength: lastPersistedContent?.length || 0
          }
        );

        throw new ServiceUnavailableException('Letter composition ended unexpectedly. Please try again in a few moments.');
      }

      this.logger.warn(
        `[writing-desk letter] stream ended early for response ${responseId}, polling for completion`,
      );

      notifyBackgroundPolling();

      const finalResponse = await this.waitForBackgroundResponseCompletion(client, responseId, {
        taskName: 'Letter composition',
        timeoutMessage: 'Letter composition timed out. Please try again in a few moments.',
        logContext: 'letter',
      });

      await captureResponseId(finalResponse);

      const finalStatus = (finalResponse as any)?.status ?? 'completed';

      if (finalStatus === 'completed') {
        const finalText = this.extractFirstText(finalResponse) ?? jsonBuffer;
        const parsed = this.parseLetterResult(finalText);
        const merged = this.mergeLetterResultWithContext(parsed, context);
        const references = Array.isArray(merged.references)
          ? merged.references.map((ref) => {
              try {
                return decodeURIComponent(ref);
              } catch {
                return ref;
              }
            })
          : [];
        const finalDocument = this.buildLetterDocumentHtml({
          mpName: merged.mp_name,
          mpAddress1: merged.mp_address_1,
          mpAddress2: merged.mp_address_2,
          mpCity: merged.mp_city,
          mpCounty: merged.mp_county,
          mpPostcode: merged.mp_postcode,
          date: merged.date,
          subjectLineHtml: merged.subject_line_html,
          letterContentHtml: merged.letter_content,
          senderName: merged.sender_name,
          senderAddress1: merged.sender_address_1,
          senderAddress2: merged.sender_address_2,
          senderAddress3: merged.sender_address_3,
          senderCity: merged.sender_city,
          senderCounty: merged.sender_county,
          senderPostcode: merged.sender_postcode,
          senderTelephone: merged.sender_phone,
          references,
        });

        await this.persistLetterResult(userId, baselineJob, {
          status: 'completed',
          tone,
          responseId,
          content: finalDocument,
          references,
          json: finalText,
        });

        run.status = 'completed';
        _settled = true;
        send({ type: 'letter_delta', html: finalDocument });
        send({
          type: 'complete',
          letter: this.toLetterCompletePayload(
            { ...merged, letter_content: finalDocument },
            { responseId, tone, rawJson: finalText },
          ),
          remainingCredits,
        });
        await this.touchStreamingRun('letter', run.key, {
          status: 'completed',
          responseId,
        });
        this.handleOpenAiSuccess();
        subject.complete();
      } else {
        const message = this.buildBackgroundFailureMessage(finalResponse, finalStatus, {
          taskName: 'Letter composition',
        });
        await this.persistLetterState(userId, baselineJob, { status: 'error', tone, responseId });
        run.status = 'error';
        _settled = true;
        send({ type: 'error', message, remainingCredits });
        await this.touchStreamingRun('letter', run.key, {
          status: 'error',
          responseId,
        });
        subject.complete();
      }

        if (quietPeriodTimer) {
          clearTimeout(quietPeriodTimer);
          quietPeriodTimer = null;
        }

        return;
    } catch (error) {
      if (deductionApplied) {
        await this.refundCredits(userId, LETTER_CREDIT_COST);
        if (typeof remainingCredits === 'number') {
          remainingCredits = Math.round((remainingCredits + LETTER_CREDIT_COST) * 100) / 100;
        }
      }

      run.status = 'error';

      // Comprehensive error logging for Docker backend-api logs
      const errorContext = {
        errorType: 'LETTER_COMPOSITION_FAILED',
        userId,
        jobId: baselineJob.jobId,
        tone,
        phase: baselineJob.phase,
        stepIndex: baselineJob.stepIndex,
        followUpIndex: baselineJob.followUpIndex,
        researchStatus: baselineJob.researchStatus,
        letterStatus: baselineJob.letterStatus,
        responseId: run.responseId,
        remainingCredits,
        deductionApplied,
        errorMessage: (error as Error)?.message ?? String(error),
        errorName: (error as Error)?.name ?? 'Unknown',
        errorStack: (error as Error)?.stack ?? 'No stack trace available',
        timestamp: new Date().toISOString(),
        requestId: run.responseId || 'unknown',
        userAgent: 'backend-api',
        service: 'writing-desk-letter-composition'
      };

      // Check if this is an OpenAI-related error
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMsg = (error as Error).message?.toLowerCase() || '';
        if (errorMsg.includes('openai') || errorMsg.includes('api key') || errorMsg.includes('network') || errorMsg.includes('timeout')) {
          this.openaiClientErrorCount++;
          this.logger.warn(`OpenAI error detected in generateLetterForUser (error count: ${this.openaiClientErrorCount})`);
          if (this.openaiClientErrorCount >= AiService.CLIENT_MAX_ERRORS) {
            this.logger.warn(`OpenAI client will be recreated on next call due to ${this.openaiClientErrorCount} consecutive errors`);
          }
        }
      }

      // Log the error with full context for debugging
      this.logger.error(
        `LETTER_COMPOSITION_ERROR: ${errorContext.errorMessage}`,
        {
          ...errorContext,
          // Additional context for debugging
          baselineJobForm: {
            issueDescription: baselineJob.form?.issueDescription?.substring(0, 200) + '...' || 'empty',
            followUpQuestionsCount: baselineJob.followUpQuestions?.length || 0,
            followUpAnswersCount: baselineJob.followUpAnswers?.length || 0
          },
          researchContentLength: researchContent?.length || 0,
          jsonBufferLength: jsonBuffer?.length || 0,
          lastPersistedContentLength: lastPersistedContent?.length || 0,
          runDuration: Date.now() - run.startedAt,
          quietPeriodTimerActive: quietPeriodTimer !== null,
          _settled: _settled
        }
      );

      try {
        await this.persistLetterState(userId, baselineJob, { status: 'error', tone });
      } catch (persistError) {
        this.logger.warn(
          `Failed to persist letter error state for user ${userId}: ${(persistError as Error)?.message ?? persistError}`,
        );
      }

      let message: string;
      if (error instanceof BadRequestException) {
        message = error.message;
      } else if (error && typeof error === 'object' && 'message' in error) {
        const errorMsg = (error as Error).message;
        if (errorMsg.includes('timeout') || errorMsg.includes('inactivity')) {
          message = 'Letter generation timed out due to inactivity. Please try again.';
        } else {
          message = 'Letter composition failed. Please try again in a few moments.';
        }
      } else {
        message = 'Letter composition failed. Please try again in a few moments.';
      }

      send({ type: 'error', message, remainingCredits });
      await this.touchStreamingRun('letter', run.key, {
        status: 'error',
        responseId: run.responseId,
      });
      subject.complete();
      
      // Clean up the quiet period timer
      if (quietPeriodTimer) {
        clearTimeout(quietPeriodTimer);
        quietPeriodTimer = null;
      }
    } finally {
      for (const controller of trackedControllers) {
        try {
          controller.abort();
        } catch {
          // ignore
        }
      }

      await this.clearStreamingRun('letter', run.key);
      this.scheduleLetterRunCleanup(run);
    }
  }

  private getLetterRunKey(userId: string, jobId: string): string {
    return `${userId}::${jobId}`;
  }

  private scheduleLetterRunCleanup(run: LetterRun) {
    if (run.cleanupTimer) {
      clearTimeout(run.cleanupTimer);
    }
    const timer = setTimeout(() => {
      this.letterRuns.delete(run.key);
      void this.clearStreamingRun('letter', run.key).catch((err) => {
        this.logger.warn(`Failed to clear letter run ${run.key}: ${(err as Error)?.message}`);
      });
    }, LETTER_RUN_TTL_MS);
    if (typeof (timer as any)?.unref === 'function') {
      (timer as any).unref();
    }
    run.cleanupTimer = timer as NodeJS.Timeout;
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
    } else {
      const persisted = await this.streamingState.getRun('deep_research', key);
      if (persisted) {
        if (persisted.responseId) {
          return this.resumeDeepResearchRunFromState({
            persisted,
            userId,
            baselineJob,
          });
        }
        await this.handleOrphanedRun(persisted);
      } else if (options?.createIfMissing === false) {
        throw new BadRequestException('We could not resume deep research. Please start a new run.');
      }
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

    await this.registerStreamingRun({
      type: 'deep_research',
      runKey: key,
      userId,
      jobId: baselineJob.jobId,
    });

    run.promise = this.executeDeepResearchRun({ run, userId, baselineJob, subject }).catch((error) => {
      this.logger.error(`Deep research run encountered an unhandled error: ${(error as Error)?.message ?? error}`);
      subject.error(error);
    });

    return run;
  }

  private async resumeDeepResearchRunFromState(params: {
    persisted: StreamingRunState;
    userId: string;
    baselineJob: ActiveWritingDeskJobResource;
  }): Promise<DeepResearchRun> {
    const { persisted, userId, baselineJob } = params;
    const subject = new ReplaySubject<DeepResearchStreamPayload>(DEEP_RESEARCH_RUN_BUFFER_SIZE);
    const run: DeepResearchRun = {
      key: persisted.runKey,
      userId,
      jobId: baselineJob.jobId,
      subject,
      status: 'running',
      startedAt: persisted.startedAt,
      cleanupTimer: null,
      promise: null,
      responseId: typeof persisted.responseId === 'string' ? persisted.responseId : null,
    };

    this.deepResearchRuns.set(persisted.runKey, run);
    
    const resumeMeta = persisted.meta ?? {};
    const charged = (resumeMeta as Record<string, unknown>)?.charged === true;
    const remainingCredits =
      typeof (resumeMeta as Record<string, unknown>)?.remainingCredits === 'number'
        ? ((resumeMeta as Record<string, unknown>).remainingCredits as number)
        : null;

    await this.touchStreamingRun('deep_research', run.key, {
      status: 'running',
      responseId: run.responseId,
      meta: { charged, remainingCredits },
    });

    subject.next({
      type: 'status',
      status: 'Reconnecting to your research run…',
      remainingCredits,
    });

    run.promise = this.executeDeepResearchRun({
      run,
      userId,
      baselineJob,
      subject,
      resumeFromState: {
        responseId: run.responseId,
        charged,
        remainingCredits,
      },
    }).catch((error) => {
      this.logger.error(
        `Deep research resume encountered an error: ${(error as Error)?.message ?? error}`,
      );
      subject.error(error);
    });

    return run;
  }

  private async resumeLetterRunFromState(params: {
    persisted: StreamingRunState;
    userId: string;
    baselineJob: ActiveWritingDeskJobResource;
  }): Promise<LetterRun> {
    const { persisted, userId, baselineJob } = params;
    const tone = this.normaliseLetterTone(
      ((persisted.meta as Record<string, unknown>)?.tone as string | undefined) ?? baselineJob.letterTone ?? null,
    );
    if (!tone) {
      throw new BadRequestException('Select a tone before composing the letter.');
    }
    const researchContent = this.normaliseResearchContent(baselineJob.researchContent ?? null);
    if (!researchContent) {
      throw new BadRequestException('Run deep research before composing the letter.');
    }

    const subject = new ReplaySubject<LetterStreamPayload>(LETTER_RUN_BUFFER_SIZE);
    const resumeMeta = persisted.meta ?? {};
    const charged = (resumeMeta as Record<string, unknown>)?.charged === true;
    const remainingCredits =
      typeof (resumeMeta as Record<string, unknown>)?.remainingCredits === 'number'
        ? ((resumeMeta as Record<string, unknown>).remainingCredits as number)
        : null;

    const run: LetterRun = {
      key: persisted.runKey,
      userId,
      jobId: baselineJob.jobId,
      tone,
      subject,
      status: 'running',
      startedAt: persisted.startedAt,
      cleanupTimer: null,
      promise: null,
      responseId: typeof persisted.responseId === 'string' ? persisted.responseId : null,
      remainingCredits,
    };

    this.letterRuns.set(persisted.runKey, run);

    subject.next({
      type: 'status',
      status: 'Reconnecting to your letter composition…',
      remainingCredits,
    });

    await this.touchStreamingRun('letter', run.key, {
      status: 'running',
      responseId: run.responseId,
      meta: { tone, charged, remainingCredits },
    });

    run.promise = this.executeLetterRun({
      run,
      userId,
      baselineJob,
      subject,
      researchContent,
      resumeFromState: {
        responseId: run.responseId,
        charged,
        remainingCredits,
      },
    }).catch((error) => {
      this.logger.error(`Letter resume encountered an error: ${(error as Error)?.message ?? error}`);
      subject.error(error);
    });

    return run;
  }

  private async executeDeepResearchRun(params: {
    run: DeepResearchRun;
    userId: string;
    baselineJob: ActiveWritingDeskJobResource;
    subject: ReplaySubject<DeepResearchStreamPayload>;
    resumeFromState?: { responseId: string | null; charged: boolean; remainingCredits: number | null };
  }) {
    const { run, userId, baselineJob, subject, resumeFromState } = params;
    const heartbeat = this.createStreamingHeartbeat('deep_research', run.key);
    let deductionApplied = false;
    let remainingCredits: number | null = resumeFromState?.remainingCredits ?? null;
    let aggregatedText = '';
    let _settled = false;
    let openAiStream: ResponseStreamLike | null = null;
    let responseId: string | null = resumeFromState?.responseId ?? run.responseId ?? null;
    let quietPeriodTimer: NodeJS.Timeout | null = null;
    let backgroundPollingNotified = false;

    const captureResponseId = async (candidate: unknown) => {
      if (!candidate || typeof candidate !== 'object') return;
      const id = (candidate as any)?.id;
      if (typeof id !== 'string') return;
      const trimmed = id.trim();
      if (!trimmed || trimmed === responseId) return;
      responseId = trimmed;
      run.responseId = trimmed;
      heartbeat({ responseId: trimmed });
      try {
        await this.persistDeepResearchResult(userId, baselineJob, {
          responseId: trimmed,
          status: run.status,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to persist deep research response id for user ${userId}: ${(error as Error)?.message ?? error}`,
        );
      }
    };

    const send = (payload: DeepResearchStreamPayload) => {
      subject.next(payload);
      heartbeat();
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
    heartbeat({ status: 'running', responseId });

    try {
      if (resumeFromState?.responseId) {
        deductionApplied = resumeFromState.charged;
        remainingCredits = resumeFromState.remainingCredits;
      } else {
        const { credits } = await this.userCredits.deductFromMine(userId, DEEP_RESEARCH_CREDIT_COST);
        deductionApplied = true;
        remainingCredits = credits;
        heartbeat({ meta: { charged: true, remainingCredits } });
      }
      send({ type: 'status', status: 'charged', remainingCredits });

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
        _settled = true;
        send({
          type: 'complete',
          content: stub.content,
          responseId: 'dev-stub',
          remainingCredits,
        });
        await this.touchStreamingRun('deep_research', run.key, {
          status: 'completed',
          responseId: 'dev-stub',
        });
        await this.clearStreamingRun('deep_research', run.key);
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

      if (resumeFromState?.responseId) {
        const resumeParams: Record<string, unknown> = {
          response_id: resumeFromState.responseId,
        };
        if (Array.isArray(requestExtras.tools) && requestExtras.tools.length > 0) {
          resumeParams.tools = requestExtras.tools;
        }
        if (typeof requestExtras.max_tool_calls === 'number') {
          resumeParams.max_tool_calls = requestExtras.max_tool_calls;
        }
        if (requestExtras.reasoning) {
          resumeParams.reasoning = requestExtras.reasoning;
        }
        openAiStream = client.responses.stream(resumeParams) as ResponseStreamLike;
      } else {
        openAiStream = (await client.responses.create({
          model,
          input: prompt,
          background: true,
          store: true,
          stream: true,
          ...requestExtras,
        })) as ResponseStreamLike;
      }

      let lastSequenceNumber: number | null = null;
      let lastCursor: string | null = null;
      let currentStream: ResponseStreamLike | null = openAiStream;
      let resumeAttempts = 0;
      let _lastActivityTime = Date.now();

      // Set up periodic status updates during quiet periods
      const lastCustomMessages: string[] = []; // Track last 2 custom messages
      const startQuietPeriodTimer = () => {
        if (quietPeriodTimer) {
          clearTimeout(quietPeriodTimer);
          quietPeriodTimer = null;
        }
        const timer = setTimeout(() => {
          const quietStatusMessages = [
            'Taking a moment to absorb the evidence…',
            'Processing the information through my democratic filters…',
            'Having a quiet think about what I\'ve learned…',
            'Cross-referencing with the parliamentary archives…',
            'Taking a step back to see the bigger picture…',
            'Having a brief consultation with the wisdom of ages…',
            'Processing some things I\'ve discovered…',
            'Taking a breather to let the evidence sink in…',
            'Having a quick think about the implications…',
            'Taking a moment to connect the dots…',
            'Consulting the constitutional wisdom of the ages…',
            'Weighing the evidence against parliamentary precedent…',
            'Considering the broader implications for democracy…',
            'Reflecting on the historical context of this issue…',
            'Analyzing the potential impact on constituents…',
            'Reviewing relevant legislation and policy frameworks…',
            'Examining the evidence from multiple perspectives…',
            'Considering the long-term democratic implications…',
            'Processing the nuances of parliamentary procedure…',
            'Evaluating the strength of the arguments presented…',
            'Taking time to consider all sides of the debate…',
            'Reflecting on the principles of representative democracy…',
            'Considering how this affects the democratic process…',
            'Weighing the evidence with parliamentary wisdom…',
            'Taking a moment to consider the democratic implications…',
            'Processing the information through constitutional lenses…',
            'Reflecting on the broader context of governance…',
            'Considering the impact on democratic institutions…',
            'Taking time to absorb the complexity of the issue…',
            'Weighing the evidence against democratic principles…'
          ];
          
          // Filter out messages that match the last 2 custom emits
          const availableMessages = quietStatusMessages.filter(
            message => !lastCustomMessages.includes(message)
          );
          
          // If all messages have been used recently, reset the tracking
          const messagesToUse = availableMessages.length > 0 ? availableMessages : quietStatusMessages;
          
          const randomMessage = messagesToUse[Math.floor(Math.random() * messagesToUse.length)];
          
          // Update tracking: add new message and keep only last 2
          lastCustomMessages.push(randomMessage);
          if (lastCustomMessages.length > 2) {
            lastCustomMessages.shift();
          }
          
          send({ type: 'event', event: { type: 'quiet_period', message: randomMessage } });
          _lastActivityTime = Date.now();
          quietPeriodTimer = null;
          startQuietPeriodTimer(); // Reset the timer
        }, 5000); // 5 seconds of inactivity
        if (typeof (timer as any)?.unref === 'function') {
          (timer as any).unref();
        }
        quietPeriodTimer = timer as NodeJS.Timeout;
      };

      startQuietPeriodTimer();

      const resumeStatusMessages = [
        'Consulting my medieval tomes for parliamentary precedents…',
        'Shuffling through my official Parliament issue tarot cards…',
        'Processing some things I\'ve learned from the evidence…',
        'Cross-referencing with the ancient scrolls of Westminster…',
        'Having a quick chat with the parliamentary ghosts…',
        'Double-checking my facts against the cosmic database…',
        'Consulting the oracle of Hansard for wisdom…',
        'Taking a moment to absorb the gravity of the situation…',
        'Rummaging through my collection of parliamentary tea leaves…',
        'Having a brief conference with the spirits of democracy…',
        'Processing the evidence through my parliamentary crystal ball…',
        'Taking a step back to see the bigger picture…',
        'Consulting the ancient texts of parliamentary procedure…',
        'Having a quick think about what I\'ve discovered…',
        'Cross-checking my findings with the parliamentary archives…',
        'Taking a moment to connect the dots…',
        'Having a quiet word with the parliamentary librarians…',
        'Processing the information through my democratic filters…',
        'Taking a breather to let the evidence sink in…',
        'Having a brief consultation with the wisdom of ages…'
      ];

      const notifyBackgroundPolling = () => {
        if (!backgroundPollingNotified) {
          send({ type: 'status', status: 'background_polling', remainingCredits });
          send({
            type: 'event',
            event: {
              type: 'quiet_period',
              message: 'The live stream hit a snag; continuing the research in the background…',
            },
          });
          backgroundPollingNotified = true;
        }
        if (quietPeriodTimer) {
          clearTimeout(quietPeriodTimer);
          quietPeriodTimer = null;
        }
      };

      const attemptStreamResume = async (
        initialError: unknown,
      ): Promise<ResponseStreamLike | null> => {
        let latestError: unknown = initialError;

        while (true) {
          if (!this.isRecoverableTransportError(latestError)) {
            throw latestError instanceof Error
              ? latestError
              : new Error('Deep research stream failed with an unknown error');
          }

          if (!responseId) {
            this.logger.warn(
              `[writing-desk research] transport failure before response id available: ${
                latestError instanceof Error ? latestError.message : 'unknown error'
              }`,
            );
            return null;
          }

          if (resumeAttempts >= RESEARCH_MAX_RESUME_ATTEMPTS) {
            this.logger.warn(
              `[writing-desk research] resume attempt limit reached for response ${responseId}, switching to background polling`,
            );
            notifyBackgroundPolling();
            return null;
          }

          resumeAttempts += 1;
          const resumeCursor = lastCursor ?? (lastSequenceNumber != null ? String(lastSequenceNumber) : null);
          const resumeCursorLog = resumeCursor ?? (lastSequenceNumber ?? 'start');
          this.logger.warn(
            `[writing-desk research] resume attempt ${resumeAttempts} for response ${responseId} starting after ${resumeCursorLog}`,
          );

          const randomMessage = resumeStatusMessages[Math.floor(Math.random() * resumeStatusMessages.length)];
          send({ type: 'event', event: { type: 'resume_attempt', message: randomMessage, attempt: resumeAttempts } });

          if (resumeAttempts > 1) {
            const backoffMs = Math.min(1000 * 2 ** (resumeAttempts - 1), 5000);
            const jitter = Math.floor(Math.random() * 300);
            await this.delay(backoffMs + jitter);
          }

          const resumeParams: {
            response_id: string;
            after?: string;
            event_id?: string;
            tools?: Array<Record<string, unknown>>;
            max_tool_calls?: number;
            reasoning?: DeepResearchRequestExtras['reasoning'];
          } = {
            response_id: responseId,
          };

          if (resumeCursor) {
            resumeParams.after = resumeCursor;
            resumeParams.event_id = resumeCursor;
          }

          if (Array.isArray(requestExtras.tools) && requestExtras.tools.length > 0) {
            resumeParams.tools = requestExtras.tools;
          }
          if (typeof requestExtras.max_tool_calls === 'number') {
            resumeParams.max_tool_calls = requestExtras.max_tool_calls;
          }
          if (requestExtras.reasoning) {
            resumeParams.reasoning = requestExtras.reasoning;
          }

          try {
            const resumedStream = client.responses.stream(resumeParams) as ResponseStreamLike;
            this.logger.log(
              `[writing-desk research] resume attempt ${resumeAttempts} succeeded for response ${responseId}`,
            );
            return resumedStream;
          } catch (resumeError) {
            this.logger.error(
              `[writing-desk research] resume attempt ${resumeAttempts} failed for response ${responseId}: ${
                resumeError instanceof Error ? resumeError.message : 'unknown error'
              }`,
            );
            latestError = resumeError;
            // Loop to evaluate whether the new error is recoverable and, if so, try again
            continue;
          }
        }
      };

      while (currentStream) {
        let streamError: unknown = null;

        try {
          // Wrap stream with inactivity timeout
          const timeoutWrappedStream = this.createStreamWithTimeout(
            currentStream,
            RESEARCH_STREAM_INACTIVITY_TIMEOUT_MS,
            () => {
              this.logger.warn(`[research] Stream inactivity timeout for job ${baselineJob.jobId}`);
              openAiStream?.controller?.abort();
            }
          );

          for await (const event of timeoutWrappedStream) {
            if (!event) continue;

            // Reset quiet period timer on any activity
            _lastActivityTime = Date.now();
            if (quietPeriodTimer) {
              clearTimeout(quietPeriodTimer);
              quietPeriodTimer = null;
            }
            startQuietPeriodTimer();

            const sequenceNumber = (event as any)?.sequence_number;
            if (Number.isFinite(sequenceNumber)) {
              lastSequenceNumber = Number(sequenceNumber);
            }

            const eventCursor =
              typeof (event as any)?.id === 'string'
                ? (event as any).id
                : typeof (event as any)?.cursor === 'string'
                  ? (event as any).cursor
                  : null;
            if (eventCursor) {
              lastCursor = eventCursor;
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
                const _errorMessage = (event as any)?.error?.message ?? 'Deep research failed';
                throw new ServiceUnavailableException('Deep research failed. Please try again later.');
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
                const usage = (finalResponse as any)?.usage ?? null;
                this.logger.log(
                  `[writing-desk research-usage] ${JSON.stringify({
                    userId,
                    jobId: baselineJob.jobId,
                    model,
                    responseId: resolvedResponseId,
                    usage,
                  })}`,
                );
                run.status = 'completed';
                _settled = true;
                send({
                  type: 'complete',
                  content: finalText,
                  responseId: resolvedResponseId,
                  remainingCredits,
                  usage: (finalResponse as any)?.usage ?? null,
                });
                await this.touchStreamingRun('deep_research', run.key, {
                  status: 'completed',
                  responseId: resolvedResponseId ?? responseId,
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

        const resumedStream = await attemptStreamResume(streamError);
        if (!resumedStream) {
          currentStream = null;
          openAiStream = null;
        } else {
          currentStream = resumedStream;
          openAiStream = resumedStream;
        }
      }

      if (!_settled) {
        if (!responseId) {
          throw new ServiceUnavailableException('Deep research stream ended unexpectedly. Please try again.');
        }

        this.logger.warn(
          `[writing-desk research] stream ended early for response ${responseId}, polling for completion`,
        );

        if (!backgroundPollingNotified) {
          send({ type: 'status', status: 'background_polling', remainingCredits });
          backgroundPollingNotified = true;
        }

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
          const usage = (finalResponse as any)?.usage ?? null;
          this.logger.log(
            `[writing-desk research-usage] ${JSON.stringify({
              userId,
              jobId: baselineJob.jobId,
              model,
              responseId,
              usage,
            })}`,
          );
          run.status = 'completed';
          _settled = true;
          send({
            type: 'complete',
            content: finalText,
            responseId,
            remainingCredits,
            usage: (finalResponse as any)?.usage ?? null,
          });
          await this.touchStreamingRun('deep_research', run.key, {
            status: 'completed',
            responseId,
          });
          this.handleOpenAiSuccess();
          subject.complete();
        } else {
          const message = this.buildBackgroundFailureMessage(finalResponse, finalStatus);
          await this.persistDeepResearchResult(userId, baselineJob, {
            responseId,
            status: 'error',
          });
          run.status = 'error';
          _settled = true;
          send({ type: 'error', message, remainingCredits });
          await this.touchStreamingRun('deep_research', run.key, {
            status: 'error',
            responseId,
          });
          subject.complete();
        }
      }

      // Clean up the quiet period timer
      if (quietPeriodTimer) {
        clearTimeout(quietPeriodTimer);
        quietPeriodTimer = null;
      }
    } catch (error) {
      // Check if this is an OpenAI-related error
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMsg = (error as Error).message?.toLowerCase() || '';
        if (errorMsg.includes('openai') || errorMsg.includes('api key') || errorMsg.includes('network') || errorMsg.includes('timeout')) {
          this.openaiClientErrorCount++;
          this.logger.warn(`OpenAI error detected in startDeepResearch (error count: ${this.openaiClientErrorCount})`);
          if (this.openaiClientErrorCount >= AiService.CLIENT_MAX_ERRORS) {
            this.logger.warn(`OpenAI client will be recreated on next call due to ${this.openaiClientErrorCount} consecutive errors`);
          }
        }
      }

      this.logger.error(
        `[writing-desk research] failure ${error instanceof Error ? error.message : 'unknown'}`,
      );

      if (deductionApplied && !_settled) {
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

      let message: string;
      if (error instanceof BadRequestException) {
        message = error.message;
      } else if (error && typeof error === 'object' && 'message' in error) {
        const errorMsg = (error as Error).message;
        if (errorMsg.includes('timeout') || errorMsg.includes('inactivity')) {
          message = 'Deep research timed out due to inactivity. Please try again.';
        } else {
          message = 'Deep research failed. Please try again in a few moments.';
        }
      } else {
        message = 'Deep research failed. Please try again in a few moments.';
      }

      send({
        type: 'error',
        message,
        remainingCredits,
      });
      await this.touchStreamingRun('deep_research', run.key, {
        status: 'error',
        responseId,
      });
      subject.complete();

      // Clean up the quiet period timer
      if (quietPeriodTimer) {
        clearTimeout(quietPeriodTimer);
        quietPeriodTimer = null;
      }
    } finally {
      if (!_settled && openAiStream?.controller) {
        try {
          openAiStream.controller.abort();
        } catch (err) {
          this.logger.warn(
            `Failed to abort deep research stream: ${(err as Error)?.message ?? 'unknown error'}`,
          );
        }
      }

      await this.clearStreamingRun('deep_research', run.key);
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
      void this.clearStreamingRun('deep_research', run.key).catch((err) => {
        this.logger.warn(`Failed to clear deep research run ${run.key}: ${(err as Error)?.message}`);
      });
    }, DEEP_RESEARCH_RUN_TTL_MS);
    if (typeof (timer as any)?.unref === 'function') {
      (timer as any).unref();
    }
    run.cleanupTimer = timer as NodeJS.Timeout;
  }

  private async waitForBackgroundResponseCompletion(
    client: any,
    responseId: string,
    options?: { taskName?: string; timeoutMessage?: string; logContext?: string },
  ) {
    const startedAt = Date.now();
    const timeoutMessage = options?.timeoutMessage ?? 'Deep research timed out. Please try again.';
    const logContext = options?.logContext ?? 'research';

    while (true) {
      try {
        const response = await client.responses.retrieve(responseId);
        const status = (response as any)?.status ?? null;

        if (!status || status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'incomplete') {
          return response;
        }

        if (Date.now() - startedAt >= BACKGROUND_POLL_TIMEOUT_MS) {
          throw new ServiceUnavailableException(timeoutMessage);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Timed out waiting')) {
          throw error;
        }
        if (Date.now() - startedAt >= BACKGROUND_POLL_TIMEOUT_MS) {
          throw new ServiceUnavailableException(timeoutMessage);
        }
        this.logger.warn(
          `[writing-desk ${logContext}] failed to retrieve background response ${responseId}: ${
            (error as Error)?.message ?? error
          }`,
        );
      }

      await this.delay(BACKGROUND_POLL_INTERVAL_MS);
    }
  }

  private buildBackgroundFailureMessage(
    response: any,
    status: string | null | undefined,
    options?: { taskName?: string },
  ): string {
    const errorMessage = response?.error?.message;
    if (typeof errorMessage === 'string' && errorMessage.trim().length > 0) {
      return errorMessage.trim();
    }

    const incompleteReason = response?.incomplete_details?.reason;
    if (typeof incompleteReason === 'string' && incompleteReason.trim().length > 0) {
      return incompleteReason.trim();
    }

    const taskName = options?.taskName ?? 'Deep research';

    switch (status) {
      case 'cancelled':
        return `${taskName} was cancelled.`;
      case 'failed':
      case 'incomplete':
        return `${taskName} failed. Please try again in a few moments.`;
      default:
        return `${taskName} finished without a usable result. Please try again in a few moments.`;
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

  private async registerStreamingRun(params: {
    type: StreamingRunKind;
    runKey: string;
    userId: string;
    jobId: string;
    status?: 'running' | 'completed' | 'error';
    responseId?: string | null;
    meta?: Record<string, unknown>;
  }) {
    try {
      await this.streamingState.registerRun(params);
    } catch (error) {
      this.logger.error(
        `[streaming-state] Failed to register ${params.type} run ${params.runKey}: ${
          (error as Error)?.message ?? error
        }`,
      );
      throw new ServiceUnavailableException('Streaming is temporarily unavailable. Please try again in a moment.');
    }
  }

  private async touchStreamingRun(
    type: StreamingRunKind,
    runKey: string,
    patch?: { status?: 'running' | 'completed' | 'error'; responseId?: string | null; meta?: Record<string, unknown> },
  ) {
    try {
      await this.streamingState.touchRun(type, runKey, patch);
    } catch (error) {
      this.logger.warn(
        `[streaming-state] Failed to update ${type} run ${runKey}: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  private async clearStreamingRun(type: StreamingRunKind, runKey: string) {
    try {
      await this.streamingState.removeRun(type, runKey);
    } catch (error) {
      this.logger.warn(
        `[streaming-state] Failed to remove ${type} run ${runKey}: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  private createStreamingHeartbeat(type: StreamingRunKind, runKey: string) {
    let lastBeatAt = 0;
    return (patch?: { status?: 'running' | 'completed' | 'error'; responseId?: string | null; meta?: Record<string, unknown> }) => {
      const now = Date.now();
      if (!patch && now - lastBeatAt < 1000) {
        return;
      }
      lastBeatAt = now;
      void this.touchStreamingRun(type, runKey, patch);
    };
  }

  async recoverStaleStreamingRuns() {
    try {
      const staleRuns = await this.streamingState.findStaleRuns(STREAMING_RUN_ORPHAN_THRESHOLD_MS);
      for (const state of staleRuns) {
        await this.handleOrphanedRun(state);
      }
    } catch (error) {
      this.logger.warn(
        `[streaming-state] Failed to sweep stale runs: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  private async handleOrphanedRun(state: StreamingRunState) {
    try {
      const job = await this.writingDeskJobs.getActiveJobForUser(state.userId);
      if (!job || job.jobId !== state.jobId) {
        await this.clearStreamingRun(state.type, state.runKey);
        return;
      }

      if (state.type === 'deep_research') {
        await this.persistDeepResearchStatus(state.userId, job, 'error');
        if (this.isRunCharged(state)) {
          await this.refundCredits(state.userId, DEEP_RESEARCH_CREDIT_COST);
        }
      } else {
        await this.persistLetterState(state.userId, job, { status: 'error', tone: job.letterTone ?? null });
        if (this.isRunCharged(state)) {
          await this.refundCredits(state.userId, LETTER_CREDIT_COST);
        }
      }
    } catch (error) {
      this.logger.warn(
        `[streaming-state] Failed to recover run ${state.type}:${state.runKey}: ${(error as Error)?.message ?? error}`,
      );
    } finally {
      await this.clearStreamingRun(state.type, state.runKey);
    }
  }

  private isRunCharged(state: StreamingRunState): boolean {
    if (!state.meta) {
      return false;
    }
    const charged = (state.meta as Record<string, unknown>).charged;
    return charged === true;
  }

  private buildDeepResearchPrompt(
    job: ActiveWritingDeskJobResource,
    options?: { mpName?: string | null },
  ): string {
    const sections: string[] = [
      'MANDATORY: ALL OUTPUT MUST USE BRITISH ENGLISH SPELLING. We are communicating exclusively with British MPs.',
      '',
      'Role & Objective:',
      '- You are a UK parliamentary research assistant. Compile an evidence dossier that will later inform a persuasive, fact-checked constituent letter to their MP. Do not draft the letter.',
      '',
      'Research Discipline:',
      '- Before gathering facts, produce a five-point search plan: list top queries, target UK sources, and anticipated evidence gaps.',
      '- Execute the plan sequentially, revising it if a lead is empty, and record any adjustments.',
      '',
      'Source & Recency Policy:',
      '- Default to UK primary / authoritative sources (GOV.UK, legislation.gov.uk, ONS, House of Commons Library, Hansard, NAO, OBR, NHS, devolved administrations, UK regulators).',
      '- Capture constituency colour by consulting at least one credible local outlet (e.g. local authority press releases, BBC regional, well-established local newspapers).',
      '- Balance perspective with reputable national journalism (BBC, Financial Times, Guardian, Times, Telegraph, ITV, Sky) and note when national coverage intersects with the constituency.',
      '- Use a non-UK source only if no UK equivalent exists, and explain why that source was necessary.',
      '- Every citation must include title, publisher, publication date, URL, and (when available) an archived link. Prefer publications ≤3 years old; explicitly justify older items.',
      '',
      'Verification Standards:',
      '- Triangulate each material claim with at least two independent sources whenever possible. If triangulation is not feasible, flag the limitation and describe the best available evidence.',
      '- Surface conflicting evidence, compare the sources, and explain how you resolved or weighted the conflict.',
      '',
      'Constituency Lens:',
      '- Highlight constituency or local-authority level statistics and reporting. Explain the local impact succinctly and why it matters for this MP.',
      '',
      'MP Dossier:',
      '- Summarise the MP’s recent votes, Hansard interventions, committee roles, APPG memberships, stated priorities, and relevant interests. Tie each to potential persuasion angles.',
      '',
      'Counterarguments:',
      '- List likely counterarguments (government, opposition, third parties) and provide concise, evidence-backed rebuttals with citations.',
      '',
      'Policy Levers:',
      '- Map findings to concrete levers: responsible departments or ministries, regulators, funding schemes, statutes (with section numbers), upcoming consultations, or oversight bodies.',
      '',
      'Evidence Quality:',
      '- Assign a confidence rating to every key claim (High = multiple recent primary/authoritative sources; Medium = limited corroboration or older data; Low = single or lower-quality source) and justify the rating in one sentence.',
      '',
      'Handover Package for Letter Drafting (inputs only — do not draft prose):',
      '- Problem framing (1–2 sentences)',
      '- Three strongest evidence bullets (each with [#] citation tags)',
      '- Specific ask(s) the MP should pursue',
      '- MP-relevant angle (why this MP should care)',
      '- Recommended tone for the eventual letter',
      '',
      'Output Structure (use numeric citations [1], [2], … consistently across all sections and the bibliography):',
      '1) Executive snapshot (≤120 words)',
      '2) Key findings (bulleted, each with [#])',
      '3) Evidence table (Claim | Evidence summary | Citation [#] | Confidence)',
      '4) MP profile & persuasive angles',
      '5) Counterarguments & rebuttals',
      '6) Policy levers & pathways',
      '7) Evidence gaps & further research',
      '8) Bibliography (numbered list aligned with citation tags, providing full citation details per the policy)',
      '',
      'Machine-Readable Summary (append verbatim):',
      '- Emit a valid JSON object (double-quoted keys/strings) exactly once:',
      '  {',
      '    "summary": "...",',
      '    "strongest_points": ["...", "...", "..."],',
      '    "asks": ["..."],',
      '    "mp_profile": "...",',
      '    "angles": ["..."],',
      '    "counterarguments": [',
      '      {"claim": "...", "rebuttal": "...", "citations": [1,2]}',
      '    ],',
      '    "policy_levers": [',
      '      {"lever": "...", "owner": "...", "citation": 3}',
      '    ],',
      '    "references": [',
      '      {"id": 1, "title": "...", "publisher": "...", "date": "...", "url": "...", "archived_url": "..."}',
      '    ]',
      '  }',
      '- Ensure citation numbers in the JSON align with the bibliography.',
      '',
      'Formatting Expectations:',
      '- Use clear headings and bullet lists exactly where specified.',
      '- Only the Evidence table may use pipe-format table syntax.',
      '- Keep prose concise and avoid filler or hypothetical content.',
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
    const payload = this.buildBaseUpsertPayload(job);

    const nextContent = this.normaliseResearchContent(result.content ?? null);
    if (nextContent !== null) {
      payload.researchContent = nextContent;
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

  private buildBaseUpsertPayload(job: ActiveWritingDeskJobResource): UpsertActiveWritingDeskJobDto {
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
      letterStatus: job.letterStatus ?? 'idle',
      letterReferences: Array.isArray(job.letterReferences) ? [...job.letterReferences] : [],
    };

    const existingResearchContent = this.normaliseResearchContent(job.researchContent ?? null);
    if (existingResearchContent !== null) {
      payload.researchContent = existingResearchContent;
    }

    const existingResearchResponseId = job.researchResponseId?.toString?.().trim?.();
    if (existingResearchResponseId) {
      payload.researchResponseId = existingResearchResponseId;
    }

    const existingTone = job.letterTone?.toString?.().trim?.();
    if (existingTone) {
      payload.letterTone = existingTone as any;
    }

    const existingLetterResponseId = job.letterResponseId?.toString?.().trim?.();
    if (existingLetterResponseId) {
      payload.letterResponseId = existingLetterResponseId;
    }

    const existingLetterContent = this.normaliseResearchContent(job.letterContent ?? null);
    if (existingLetterContent !== null) {
      payload.letterContent = existingLetterContent;
    }

    const existingLetterJson = this.normaliseResearchContent(job.letterJson ?? null);
    if (existingLetterJson !== null) {
      payload.letterJson = existingLetterJson;
    }

    return payload;
  }

  private normaliseResearchContent(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const normalised = value.replace(/\r\n/g, '\n');
    return normalised.trim().length > 0 ? normalised : null;
  }

  private normaliseLetterTone(value: string | null | undefined): WritingDeskLetterTone | null {
    if (typeof value !== 'string') return null;
    const normalised = value.trim().toLowerCase().replace(/\s+/g, '_');
    const matched = (WRITING_DESK_LETTER_TONES as readonly string[]).find((tone) => tone === normalised);
    return (matched as WritingDeskLetterTone | undefined) ?? null;
  }

  private normaliseLetterVerbosity(raw: string | undefined | null): 'low' | 'medium' | 'high' {
    const value = raw?.trim?.().toLowerCase?.();
    if (value === 'low' || value === 'high') return value;
    return 'medium';
  }

  private normaliseLetterReasoningEffort(
    model: string,
    raw: string | undefined | null,
  ): 'low' | 'medium' | 'high' {
    const supported = this.getSupportedReasoningEfforts(model);
    const requested = raw?.trim?.().toLowerCase?.();
    if (requested && (supported as readonly string[]).includes(requested)) {
      return requested as 'low' | 'medium' | 'high';
    }
    if (supported.includes('medium')) return 'medium';
    return supported[0];
  }

  private async resolveLetterContext(userId: string): Promise<LetterContext> {
    const [userRecord, addressRecord, mpRecord] = await Promise.all([
      this.users.findById(userId).catch(() => null),
      this.userAddress
        .getMine(userId)
        .catch(() => ({ address: null })),
      this.userMp.getMine(userId).catch(() => null),
    ]);

    const senderNameRaw = (userRecord as any)?.name;
    const senderName = typeof senderNameRaw === 'string' && senderNameRaw.trim().length > 0 ? senderNameRaw.trim() : '';

    const senderAddress = (addressRecord as any)?.address ?? {};
    const senderAddress1 = typeof senderAddress?.line1 === 'string' ? senderAddress.line1 : '';
    const senderAddress2 = typeof senderAddress?.line2 === 'string' ? senderAddress.line2 : '';
    const senderCity = typeof senderAddress?.city === 'string' ? senderAddress.city : '';
    const senderCounty = typeof senderAddress?.county === 'string' ? senderAddress.county : '';
    const senderPostcode = typeof senderAddress?.postcode === 'string' ? senderAddress.postcode : '';
    const senderTelephone = typeof senderAddress?.telephone === 'string' ? senderAddress.telephone : '';

    const mpName =
      typeof (mpRecord as any)?.mp?.name === 'string' && (mpRecord as any).mp.name.trim().length > 0
        ? (mpRecord as any).mp.name.trim()
        : '';
    const constituency =
      typeof (mpRecord as any)?.constituency === 'string' && (mpRecord as any).constituency.trim().length > 0
        ? (mpRecord as any).constituency.trim()
        : '';

    const parsedMpAddress = this.parseParliamentaryAddress((mpRecord as any)?.mp?.parliamentaryAddress);

    const today = new Date().toISOString().slice(0, 10);

    return {
      mpName,
      mpAddress1: parsedMpAddress.line1,
      mpAddress2: parsedMpAddress.line2,
      mpCity: parsedMpAddress.city,
      mpCounty: parsedMpAddress.county,
      mpPostcode: parsedMpAddress.postcode,
      constituency,
      senderName,
      senderAddress1,
      senderAddress2,
      senderAddress3: '',
      senderCity,
      senderCounty,
      senderPostcode,
      senderTelephone,
      today,
    };
  }

  private buildStubLetter(params: {
    job: ActiveWritingDeskJobResource;
    tone: WritingDeskLetterTone;
    context: LetterContext;
    research: string;
  }): WritingDeskLetterResult {
    const { job, tone, context, research } = params;
    const intake = (job.form?.issueDescription ?? '').trim();
    const intakeSummary =
      intake.length > 0
        ? intake
        : 'I am raising an urgent local issue that requires your attention on behalf of my household.';

    const qaPairs = Array.isArray(job.followUpQuestions)
      ? job.followUpQuestions
          .map((question, index) => {
            const answer = job.followUpAnswers?.[index] ?? '';
            if (!(question && question.trim()) && !(answer && answer.trim())) {
              return null;
            }
            return {
              question: (question ?? '').trim(),
              answer: (answer ?? '').trim(),
            };
          })
          .filter((value): value is { question: string; answer: string } => !!value)
          .slice(0, 3)
      : [];

    const normalisedResearch = research
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const bulletCandidates = normalisedResearch
      .filter((line) => /^[-*•]/.test(line))
      .map((line) => line.replace(/^[-*•]\s*/, ''));

    const processedResearchLines = (bulletCandidates.length > 0 ? bulletCandidates : normalisedResearch)
      .map((line) => line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)'))
      .map((line) => line.replace(/[*#>`]/g, ''))
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, bulletCandidates.length > 0 ? 3 : 2);

    const escapeHtml = (value: string): string =>
      value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const toParagraph = (value: string): string =>
      `<p>${escapeHtml(value).replace(/\n+/g, '<br />')}</p>`;

    const followUpHtml =
      qaPairs.length > 0
        ? `<p><strong>Additional detail previously provided:</strong></p><ul>${qaPairs
            .map(({ question, answer }) => {
              const escapedQuestion = escapeHtml(question);
              if (answer.length === 0) {
                return `<li><strong>${escapedQuestion}</strong></li>`;
              }
              const answerHtml = escapeHtml(` ${answer}`).replace(/\n+/g, '<br />');
              return `<li><strong>${escapedQuestion}</strong>${answerHtml}</li>`;
            })
            .join('')}</ul>`
        : '';

    let researchHtml = '';
    if (processedResearchLines.length > 0) {
      if (processedResearchLines.length === 1) {
        researchHtml = toParagraph(`Supporting evidence: ${processedResearchLines[0]}`);
      } else {
        researchHtml = `<p><strong>Supporting evidence:</strong></p><ul>${processedResearchLines
          .map((line) => `<li>${escapeHtml(line)}</li>`)
          .join('')}</ul>`;
      }
    }

    const requestPrefix = getLetterToneRequestPrefix(tone);
    const request = `${requestPrefix} raise this issue with the relevant authorities, outline the steps you can take, and keep me informed of any progress.`;
    const signOff = getLetterToneSignOff(tone);
    const senderName = context.senderName || 'A concerned constituent';

    const subjectSource = intakeSummary.split(/\n+/)[0]?.trim() ?? '';
    const compactSubject = subjectSource.replace(/\s+/g, ' ').trim();
    const fallbackSubject = 'Constituent concern requiring your support';
    const subjectText = compactSubject.length > 0 ? compactSubject : fallbackSubject;
    const truncatedSubject = subjectText.length > 160 ? `${subjectText.slice(0, 157)}…` : subjectText;
    const subjectLineHtml = `<p><strong>Subject:</strong> ${escapeHtml(truncatedSubject)}</p>`;

    const letterSections: string[] = [
      toParagraph(
        `I am writing as a constituent in ${context.constituency || 'our constituency'} to share the following situation: ${intakeSummary}`,
      ),
    ];

    if (followUpHtml) {
      letterSections.push(followUpHtml);
    }

    if (researchHtml) {
      letterSections.push(researchHtml);
    }

    letterSections.push(toParagraph(request));
    letterSections.push(`<p>${escapeHtml(signOff)}<br />${escapeHtml(senderName)}</p>`);

    return {
      mp_name: context.mpName || 'Your MP',
      mp_address_1: context.mpAddress1 || '',
      mp_address_2: context.mpAddress2 || '',
      mp_city: context.mpCity || '',
      mp_county: context.mpCounty || '',
      mp_postcode: context.mpPostcode || '',
      date: context.today,
      subject_line_html: subjectLineHtml,
      letter_content: letterSections.join(''),
      sender_name: context.senderName || '',
      sender_address_1: context.senderAddress1 || '',
      sender_address_2: context.senderAddress2 || '',
      sender_address_3: context.senderAddress3 || '',
      sender_city: context.senderCity || '',
      sender_county: context.senderCounty || '',
      sender_postcode: context.senderPostcode || '',
      sender_phone: context.senderTelephone || '',
      references: [],
    };
  }

  private buildLetterDocumentHtml(input: LetterDocumentInput): string {
    const normalise = (value: string | null | undefined): string =>
      typeof value === 'string' ? this.normaliseLetterTypography(value) : '';

    const sections: string[] = [];
    const mpLines = this.buildAddressLines({
      name: normalise(input.mpName),
      line1: normalise(input.mpAddress1),
      line2: normalise(input.mpAddress2),
      line3: null,
      city: normalise(input.mpCity),
      county: normalise(input.mpCounty),
      postcode: normalise(input.mpPostcode),
    });
    if (mpLines.length > 0) {
      sections.push(`<p>${mpLines.map((line) => this.escapeLetterHtml(line)).join('<br />')}</p>`);
    }

    const formattedDate = this.formatLetterDisplayDate(normalise(input.date));
    if (formattedDate) {
      sections.push(`<p>${this.escapeLetterHtml(formattedDate)}</p>`);
    }

    const subjectLineHtml = normalise(input.subjectLineHtml).trim();
    if (subjectLineHtml.length > 0) {
      sections.push(subjectLineHtml);
    }

    const letterContentHtml = normalise(input.letterContentHtml);
    if (letterContentHtml) {
      sections.push(letterContentHtml);
    }

    const senderName = normalise(input.senderName).trim();
    const senderLines = this.buildAddressLines({
      name: null,
      line1: normalise(input.senderAddress1),
      line2: normalise(input.senderAddress2),
      line3: normalise(input.senderAddress3),
      city: normalise(input.senderCity),
      county: normalise(input.senderCounty),
      postcode: normalise(input.senderPostcode),
    });

    const hasAddressDetail = senderLines.some((line) => line.trim().length > 0);
    if (hasAddressDetail && this.shouldAppendSenderAddress(letterContentHtml, senderLines, senderName)) {
      sections.push(`<p>${senderLines.map((line) => this.escapeLetterHtml(line)).join('<br />')}</p>`);
    }

    const telephone = normalise(input.senderTelephone).trim();
    if (telephone.length > 0) {
      sections.push(`<p>Tel: ${this.escapeLetterHtml(telephone)}</p>`);
    }

    const references = Array.isArray(input.references)
      ? input.references
          .filter((ref) => typeof ref === 'string' && ref.trim().length > 0)
          .map((ref) => this.normaliseLetterTypography(ref))
      : [];
    if (references.length > 0) {
      sections.push('<p><strong>References</strong></p>');
      sections.push(
        `<ul>${references
          .map((ref) => {
            const trimmed = ref.trim();
            if (!trimmed) return '';
            // Don't escape the URL for the href attribute, but escape the display text
            const displayText = this.escapeLetterHtml(trimmed);
            return `<li><a href="${trimmed}" target="_blank" rel="noreferrer noopener">${displayText}</a></li>`;
          })
          .filter((entry) => entry.length > 0)
          .join('')}</ul>`,
      );
    }

    return sections.join('');
  }

  private buildAddressLines(input: {
    name?: string | null;
    line1?: string | null;
    line2?: string | null;
    line3?: string | null;
    city?: string | null;
    county?: string | null;
    postcode?: string | null;
  }): string[] {
    const lines: string[] = [];
    const push = (value?: string | null) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        lines.push(trimmed);
      }
    };

    push(input.name);
    push(input.line1);
    push(input.line2);
    push(input.line3);

    const city = typeof input.city === 'string' ? input.city.trim() : '';
    const county = typeof input.county === 'string' ? input.county.trim() : '';
    const postcode = typeof input.postcode === 'string' ? input.postcode.trim() : '';

    const hasCity = city.length > 0;
    const hasCounty = county.length > 0;
    const hasPostcode = postcode.length > 0;

    if (hasCity && !hasCounty && hasPostcode) {
      lines.push(`${city} ${postcode}`.trim());
    } else {
      const locality = [city, county].filter((part) => part.length > 0).join(', ');
      if (locality.length > 0) {
        lines.push(locality);
      }
      if (hasPostcode) {
        lines.push(postcode);
      }
    }

    if (!hasCity && !hasCounty && hasPostcode && lines[lines.length - 1] !== postcode) {
      lines.push(postcode);
    }

    return lines;
  }

  private escapeLetterHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatLetterDisplayDate(value: string | null | undefined): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed) return '';
    const isoMatch = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
    if (!isoMatch) {
      return trimmed;
    }
    const [year, month, day] = trimmed.split('-');
    if (!year || !month || !day) return trimmed;
    return `${day}/${month}/${year}`;
  }

  private shouldAppendSenderAddress(
    letterHtml: string,
    senderLines: string[],
    senderName?: string | null,
  ): boolean {
    const addressDetail = senderLines.filter((line) => line.trim().length > 0);
    if (addressDetail.length === 0) return false;
    const text = this.normaliseLetterPlainText(letterHtml);
    if (!text) return true;
    const lower = text.toLowerCase();
    const hasAddress = addressDetail.some((line) => lower.includes(line.trim().toLowerCase()));
    if (hasAddress) {
      return false;
    }
    if (typeof senderName === 'string' && senderName.trim().length > 0) {
      const name = senderName.trim().toLowerCase();
      if (!lower.includes(name)) {
        return true;
      }
    }
    return true;
  }

  private normaliseLetterPlainText(value: string | null | undefined): string {
    if (typeof value !== 'string') return '';
    const normalised = this.normaliseLetterTypography(value);
    return normalised
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(p|div|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toLetterCompletePayload(
    result: WritingDeskLetterResult,
    extras: { responseId: string | null; tone: WritingDeskLetterTone; rawJson: string },
  ): LetterCompletePayload {
    return {
      mpName: result.mp_name ?? '',
      mpAddress1: result.mp_address_1 ?? '',
      mpAddress2: result.mp_address_2 ?? '',
      mpCity: result.mp_city ?? '',
      mpCounty: result.mp_county ?? '',
      mpPostcode: result.mp_postcode ?? '',
      date: result.date ?? '',
      subjectLineHtml: result.subject_line_html ?? '',
      letterContent: result.letter_content ?? '',
      senderName: result.sender_name ?? '',
      senderAddress1: result.sender_address_1 ?? '',
      senderAddress2: result.sender_address_2 ?? '',
      senderAddress3: result.sender_address_3 ?? '',
      senderCity: result.sender_city ?? '',
      senderCounty: result.sender_county ?? '',
      senderPostcode: result.sender_postcode ?? '',
      senderTelephone: result.sender_phone ?? '',
      references: Array.isArray(result.references) ? result.references : [],
      responseId: extras.responseId ?? null,
      tone: extras.tone,
      rawJson: extras.rawJson,
    };
  }

  private parseLetterResult(text: string): WritingDeskLetterResult {
    try {
      const parsed = JSON.parse(text) as WritingDeskLetterResult;
      if (!parsed || typeof parsed !== 'object') {
        throw new InternalServerErrorException('Letter response was not in the expected format.');
      }
      return this.normaliseLetterResultTypography({
        mp_name: parsed.mp_name ?? '',
        mp_address_1: parsed.mp_address_1 ?? '',
        mp_address_2: parsed.mp_address_2 ?? '',
        mp_city: parsed.mp_city ?? '',
        mp_county: parsed.mp_county ?? '',
        mp_postcode: parsed.mp_postcode ?? '',
        date: parsed.date ?? '',
        subject_line_html: parsed.subject_line_html ?? '',
        letter_content: parsed.letter_content ?? '',
        sender_name: parsed.sender_name ?? '',
        sender_address_1: parsed.sender_address_1 ?? '',
        sender_address_2: parsed.sender_address_2 ?? '',
        sender_address_3: parsed.sender_address_3 ?? '',
        sender_city: parsed.sender_city ?? '',
        sender_county: parsed.sender_county ?? '',
        sender_postcode: parsed.sender_postcode ?? '',
        sender_phone: parsed.sender_phone ?? '',
        references: Array.isArray(parsed.references) ? parsed.references : [],
      });
    } catch (_error) {
      throw new InternalServerErrorException('Failed to parse letter response. Please try again.');
    }
  }

  private mergeLetterResultWithContext(
    result: WritingDeskLetterResult,
    context: LetterContext,
  ): WritingDeskLetterResult {
    const normalise = (value: string | null | undefined): string => {
      if (typeof value !== 'string') return '';
      return this.normaliseLetterTypography(value.trim());
    };

    return this.normaliseLetterResultTypography({
      ...result,
      mp_name: normalise(context.mpName),
      mp_address_1: normalise(context.mpAddress1),
      mp_address_2: normalise(context.mpAddress2),
      mp_city: normalise(context.mpCity),
      mp_county: normalise(context.mpCounty),
      mp_postcode: normalise(context.mpPostcode),
      date: normalise(context.today),
      sender_name: normalise(context.senderName),
      sender_address_1: normalise(context.senderAddress1),
      sender_address_2: normalise(context.senderAddress2),
      sender_address_3: normalise(context.senderAddress3),
      sender_city: normalise(context.senderCity),
      sender_county: normalise(context.senderCounty),
      sender_postcode: normalise(context.senderPostcode),
      sender_phone: normalise(context.senderTelephone),
    });
  }

  private extractOutputTextDelta(event: Record<string, unknown>): string | null {
    const delta = (event as any)?.delta ?? (event as any)?.text ?? null;
    return typeof delta === 'string' ? delta : null;
  }

  private extractStringPreviewField(buffer: string, field: string): string | null {
    const marker = `"${field}":"`;
    const index = buffer.lastIndexOf(marker);
    if (index === -1) return null;
    const start = index + marker.length;
    let result = '';
    let i = start;
    while (i < buffer.length) {
      const char = buffer[i];
      if (char === '"') {
        const escaped = i > start && buffer[i - 1] === '\\';
        if (!escaped) {
          break;
        }
      }

      if (char === '\\') {
        const next = buffer[i + 1];
        if (next === 'n') {
          result += '\n';
          i += 2;
          continue;
        }
        if (next === 'r') {
          result += '\n';
          i += 2;
          continue;
        }
        if (next === 't') {
          result += '\t';
          i += 2;
          continue;
        }
        if (next === 'b' || next === 'f') {
          i += 2;
          continue;
        }
        if (next === '\\' || next === '"') {
          result += next;
          i += 2;
          continue;
        }
        if (next === '/') {
          result += '/';
          i += 2;
          continue;
        }
        if (next === 'u' && i + 5 < buffer.length) {
          const code = buffer.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(code)) {
            result += String.fromCharCode(parseInt(code, 16));
            i += 6;
            continue;
          }
        }
        i += 2;
        continue;
      }

      result += char;
      i += 1;
    }

    return result;
  }

  private extractLetterPreview(buffer: string): string | null {
    return this.extractStringPreviewField(buffer, 'letter_content');
  }

  private extractSubjectLinePreview(buffer: string): string | null {
    return this.extractStringPreviewField(buffer, 'subject_line_html');
  }

  private extractReferencesFromJson(buffer: string): string[] {
    try {
      const parsed = JSON.parse(buffer);
      const refs = Array.isArray(parsed.references) ? parsed.references : [];
      // Decode percent-encoded URLs
      return refs.map((ref) => {
        if (typeof ref !== 'string') return '';
        try {
          return decodeURIComponent(ref);
        } catch {
          return ref;
        }
      }).filter(ref => ref.length > 0);
    } catch {
      return [];
    }
  }

  private normaliseLetterResultTypography(result: WritingDeskLetterResult): WritingDeskLetterResult {
    const normalise = (value: string | null | undefined): string => {
      if (typeof value !== 'string') return '';
      return this.normaliseLetterTypography(value);
    };

    return {
      ...result,
      mp_name: normalise(result.mp_name),
      mp_address_1: normalise(result.mp_address_1),
      mp_address_2: normalise(result.mp_address_2),
      mp_city: normalise(result.mp_city),
      mp_county: normalise(result.mp_county),
      mp_postcode: normalise(result.mp_postcode),
      date: normalise(result.date),
      subject_line_html: normalise(result.subject_line_html),
      letter_content: normalise(result.letter_content),
      sender_name: normalise(result.sender_name),
      sender_address_1: normalise(result.sender_address_1),
      sender_address_2: normalise(result.sender_address_2),
      sender_address_3: normalise(result.sender_address_3),
      sender_city: normalise(result.sender_city),
      sender_county: normalise(result.sender_county),
      sender_postcode: normalise(result.sender_postcode),
      sender_phone: normalise(result.sender_phone),
      references: Array.isArray(result.references)
        ? result.references
            .map((value) => (typeof value === 'string' ? this.normaliseLetterTypography(value) : ''))
            .filter((value) => value.length > 0)
        : [],
    };
  }

  private normaliseLetterTypography(value: string): string {
    if (!value) {
      return '';
    }

    let output = value;

    const punctuationReplacements: Array<[string, string]> = [
      ['\u2018', "'"],
      ['\u2019', "'"],
      ['\u201A', "'"],
      ['\u201B', "'"],
      ['\u2032', "'"],
      ['\u2035', "'"],
      ['\u02BB', "'"],
      ['\u02BC', "'"],
      ['\u0091', "'"],
      ['\u0092', "'"],
      ['\u201C', '"'],
      ['\u201D', '"'],
      ['\u201E', '"'],
      ['\u201F', '"'],
      ['\u2033', '"'],
      ['\u2036', '"'],
      ['\u0093', '"'],
      ['\u0094', '"'],
      ['\u2010', '-'],
      ['\u2011', '-'],
      ['\u2012', '-'],
      ['\u2013', '-'],
      ['\u2014', '-'],
      ['\u2015', '-'],
      ['\u2212', '-'],
      ['\u0096', '-'],
      ['\u0097', '-'],
      ['\u2022', '*'],
      ['\u2026', '...'],
    ];

    for (const [target, replacement] of punctuationReplacements) {
      output = output.split(target).join(replacement);
    }

    const spaceLikeCharacters = [
      '\u00A0',
      '\u1680',
      '\u2000',
      '\u2001',
      '\u2002',
      '\u2003',
      '\u2004',
      '\u2005',
      '\u2006',
      '\u2007',
      '\u2008',
      '\u2009',
      '\u200A',
      '\u202F',
      '\u205F',
      '\u3000',
    ];

    for (const char of spaceLikeCharacters) {
      output = output.split(char).join(' ');
    }

    const zeroWidthCharacters = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF'];
    for (const char of zeroWidthCharacters) {
      output = output.split(char).join('');
    }

    return output;
  }

  private async persistLetterState(
    userId: string,
    fallback: ActiveWritingDeskJobResource,
    update: {
      status?: WritingDeskLetterStatus;
      tone?: WritingDeskLetterTone | null;
      responseId?: string | null;
      content?: string | null;
      references?: string[] | null;
      json?: string | null;
    },
  ) {
    const latest = await this.writingDeskJobs.getActiveJobForUser(userId);
    const job = latest ?? fallback;
    const payload = this.buildLetterUpsertPayload(job, update);
    await this.writingDeskJobs.upsertActiveJob(userId, payload);
  }

  private async persistLetterResult(
    userId: string,
    fallback: ActiveWritingDeskJobResource,
    update: {
      status: WritingDeskLetterStatus;
      tone?: WritingDeskLetterTone | null;
      responseId?: string | null;
      content?: string | null;
      references?: string[] | null;
      json?: string | null;
    },
  ) {
    await this.persistLetterState(userId, fallback, update);
  }

  private buildLetterUpsertPayload(
    job: ActiveWritingDeskJobResource,
    update: {
      status?: WritingDeskLetterStatus;
      tone?: WritingDeskLetterTone | null;
      responseId?: string | null;
      content?: string | null;
      references?: string[] | null;
      json?: string | null;
    },
  ): UpsertActiveWritingDeskJobDto {
    const payload = this.buildBaseUpsertPayload(job);

    if (update.status) {
      payload.letterStatus = update.status;
    }

    if (update.tone !== undefined) {
      payload.letterTone = update.tone ?? undefined;
    }

    if (update.responseId !== undefined) {
      payload.letterResponseId = update.responseId ?? undefined;
    }

    if (update.content !== undefined) {
      const normalised = this.normaliseResearchContent(update.content);
      payload.letterContent = normalised ?? undefined;
    }

    if (update.references !== undefined) {
      payload.letterReferences = Array.isArray(update.references)
        ? update.references
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value) => value.length > 0)
        : [];
    }

    if (update.json !== undefined) {
      const normalisedJson = this.normaliseResearchContent(update.json);
      payload.letterJson = normalisedJson ?? undefined;
    }

    return payload;
  }

  private parseParliamentaryAddress(value: string | null | undefined) {
    if (typeof value !== 'string') {
      return { line1: '', line2: '', city: '', county: '', postcode: '' };
    }

    const segments = value
      .split(/[\n,]+/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    const postcodeRegex = /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
    let postcode = '';
    for (let i = segments.length - 1; i >= 0; i -= 1) {
      const candidate = segments[i];
      if (postcodeRegex.test(candidate)) {
        postcode = this.normaliseUkPostcode(candidate);
        segments.splice(i, 1);
        break;
      }
    }

    const line1 = segments.shift() ?? '';
    const line2 = segments.shift() ?? '';
    const city = segments.shift() ?? '';
    const county = segments.shift() ?? '';

    return { line1, line2, city, county, postcode };
  }

  private normaliseUkPostcode(input: string): string {
    const tight = (input || '').replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(tight)) return input?.trim?.() ?? '';
    return `${tight.slice(0, -3)} ${tight.slice(-3)}`;
  }

  private normaliseStreamEvent(event: ResponseStreamEvent): Record<string, unknown> {
    if (!event || typeof event !== 'object') {
      return { value: event ?? null };
    }

    try {
      return JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
    } catch {
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

  async transcribeAudio(userId: string | null | undefined, input: TranscriptionDto) {
    if (!userId) {
      throw new BadRequestException('User account required');
    }

    const { credits: remainingAfterCharge } = await this.userCredits.deductFromMine(userId, TRANSCRIPTION_CREDIT_COST);
    const apiKey = this.config.get<string>('OPENAI_API_KEY');

    try {
      if (!apiKey) {
        // In dev without key, return a stub so flows work
        const stubText = 'DEV-STUB: This is a placeholder transcription. Please configure OPENAI_API_KEY for real transcription.';
        this.logger.log(`[transcription] DEV-STUB ${JSON.stringify({ model: 'dev-stub', text: stubText })}`);
        return {
          model: 'dev-stub',
          text: stubText,
          remainingCredits: remainingAfterCharge,
        };
      }

      const client = await this.getOpenAiClient(apiKey);
      const model = this.resolveTranscriptionModel(input.model);
      const responseFormat = input.responseFormat ?? TranscriptionResponseFormat.TEXT;
      
      // Convert base64 to buffer
      const audioBuffer = Buffer.from(input.audioData, 'base64');
      
      // Create a File-like object for the OpenAI API
      const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

      const transcription = await client.audio.transcriptions.create({
        file: audioFile,
        model,
        response_format: responseFormat,
        prompt: input.prompt || 'Use British English spelling throughout.',
        language: input.language || 'en',
      });

      this.logger.log(`[transcription] Raw response: ${JSON.stringify(transcription)}`);

      this.handleOpenAiSuccess();

      const bundle = {
        model,
        text: transcription.text || transcription || 'No transcription text received',
        remainingCredits: remainingAfterCharge,
      };
      
      this.logger.log(`[transcription] Processed bundle: ${JSON.stringify(bundle)}`);

      return bundle;
    } catch (error) {
      // Check if this is an OpenAI-related error
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMsg = (error as Error).message?.toLowerCase() || '';
        if (errorMsg.includes('openai') || errorMsg.includes('api key') || errorMsg.includes('network') || errorMsg.includes('timeout')) {
          this.openaiClientErrorCount++;
          this.logger.warn(`OpenAI error detected in transcribeAudio (error count: ${this.openaiClientErrorCount})`);
          if (this.openaiClientErrorCount >= AiService.CLIENT_MAX_ERRORS) {
            this.logger.warn(`OpenAI client will be recreated on next call due to ${this.openaiClientErrorCount} consecutive errors`);
          }
        }
      }
      await this.refundCredits(userId, TRANSCRIPTION_CREDIT_COST);
      throw error;
    }
  }

  streamTranscription(userId: string | null | undefined, input: StreamingTranscriptionDto): Observable<MessageEvent> {
    if (!userId) {
      throw new BadRequestException('User account required');
    }

    return new Observable<MessageEvent>((subscriber) => {
      let _settled = false;

      const transcribe = async () => {
        try {
          const { credits: remainingAfterCharge } = await this.userCredits.deductFromMine(userId, TRANSCRIPTION_CREDIT_COST);
          const apiKey = this.config.get<string>('OPENAI_API_KEY');

          if (!apiKey) {
            // In dev without key, return a stub so flows work
            const stubText = 'DEV-STUB: This is a placeholder streaming transcription. Please configure OPENAI_API_KEY for real transcription.';
            subscriber.next({ data: JSON.stringify({ type: 'delta', text: stubText }) });
            subscriber.next({ data: JSON.stringify({ type: 'complete', text: stubText, remainingCredits: remainingAfterCharge }) });
            subscriber.complete();
            return;
          }

          const client = await this.getOpenAiClient(apiKey);
          const model = this.resolveTranscriptionModel(input.model);
          
          // Convert base64 to buffer
          const audioBuffer = Buffer.from(input.audioData, 'base64');
          
          // Create a File-like object for the OpenAI API
          const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

          const stream = await client.audio.transcriptions.create({
            file: audioFile,
            model,
            response_format: TranscriptionResponseFormat.TEXT,
            stream: true,
            prompt: input.prompt || 'Use British English spelling throughout.',
            language: input.language || 'en',
          });

          // Wrap stream with inactivity timeout
          const timeoutWrappedStream = this.createStreamWithTimeout(
            stream,
            TRANSCRIPTION_STREAM_INACTIVITY_TIMEOUT_MS,
            () => {
              this.logger.warn(`[transcription] Stream inactivity timeout for user ${userId}`);
            }
          );

          for await (const event of timeoutWrappedStream) {
            if (subscriber.closed) break;
            
            const typedEvent = event as any;
            if (typedEvent.type === 'transcript.text.delta') {
              subscriber.next({ data: JSON.stringify({ type: 'delta', text: typedEvent.delta }) });
            } else if (typedEvent.type === 'transcript.text.done') {
              this.handleOpenAiSuccess();
              subscriber.next({ data: JSON.stringify({ type: 'complete', text: typedEvent.text, remainingCredits: remainingAfterCharge }) });
              subscriber.complete();
              _settled = true;
              return;
            }
          }

          if (!_settled) {
            subscriber.next({ data: JSON.stringify({ type: 'error', message: 'Transcription stream ended unexpectedly' }) });
            subscriber.complete();
          }
        } catch (error) {
          // Check if this is an OpenAI-related error
          if (error && typeof error === 'object' && 'message' in error) {
            const errorMsg = (error as Error).message?.toLowerCase() || '';
            if (errorMsg.includes('openai') || errorMsg.includes('api key') || errorMsg.includes('network') || errorMsg.includes('timeout')) {
              this.openaiClientErrorCount++;
              this.logger.warn(`OpenAI error detected in streamTranscription (error count: ${this.openaiClientErrorCount})`);
              if (this.openaiClientErrorCount >= AiService.CLIENT_MAX_ERRORS) {
                this.logger.warn(`OpenAI client will be recreated on next call due to ${this.openaiClientErrorCount} consecutive errors`);
              }
            }
          }
          if (!subscriber.closed) {
            await this.refundCredits(userId, TRANSCRIPTION_CREDIT_COST);
            let errorMessage = 'Transcription failed';
            if (error instanceof Error) {
              const errorMsg = error.message;
              if (errorMsg.includes('timeout') || errorMsg.includes('inactivity')) {
                errorMessage = 'Transcription timed out due to inactivity. Please try again.';
              } else {
                errorMessage = error.message;
              }
            }
            subscriber.next({ data: JSON.stringify({ type: 'error', message: errorMessage }) });
            subscriber.complete();
          }
        }
      };

      void transcribe();

      return () => {
        _settled = true;
      };
    });
  }
}
