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
  WritingDeskResearchStatus,
} from '../writing-desk-jobs/writing-desk-jobs.types';
import { UpsertActiveWritingDeskJobDto } from '../writing-desk-jobs/dto/upsert-active-writing-desk-job.dto';
import { Observable, ReplaySubject, Subscription } from 'rxjs';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
import { StreamingRunState, StreamingRunKind } from '../streaming-state/streaming-state.types';
import { OpenAiClientService } from './openai/openai-client.service';
import { StreamingRunManager } from './streaming/streaming-run.manager';
import { WritingDeskLetterService } from './writing-desk/letter/letter.service';
import { extractFirstText, getSupportedReasoningEfforts, isOpenAiRelatedError } from './openai/openai.helpers';

const FOLLOW_UP_CREDIT_COST = 0.1;
const DEEP_RESEARCH_CREDIT_COST = 0.7;
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
const STREAMING_RUN_ORPHAN_THRESHOLD_MS = 2 * 60 * 1000;
// Stream inactivity timeouts - max time between events before aborting
@Injectable()
export class AiService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AiService.name);
  private readonly deepResearchRuns = new Map<string, DeepResearchRun>();
  private readonly instanceId: string;
  private cleanupSweepInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly userCredits: UserCreditsService,
    private readonly writingDeskJobs: WritingDeskJobsService,
    private readonly userMp: UserMpService,
    private readonly users: UsersService,
    private readonly userAddress: UserAddressService,
    private readonly streamingRuns: StreamingRunManager,
    private readonly openAiClient: OpenAiClientService,
    private readonly letterService: WritingDeskLetterService,
  ) {
    this.instanceId = this.streamingRuns.getInstanceId();
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
      const allRuns = await this.streamingRuns.listAllRuns();
      const activeRuns = allRuns.filter(run => run.status === 'running' && run.instanceId === this.instanceId);
      
      this.logger.log(`Found ${activeRuns.length} active streaming runs to drain`);

      // Drain each active run
      const drainPromises = activeRuns.map(async (run) => {
        try {
          const runKey = run.runKey;
          
          if (run.type === 'deep_research') {
            const localRun = this.deepResearchRuns.get(runKey);
          if (localRun) {
              await this.streamingRuns.updateRun(run.type, runKey, { status: 'cancelled' });
            this.logger.log(`Cancelled ${run.type} run: ${runKey}`);
          } else {
              await this.streamingRuns.updateRun(run.type, runKey, { status: 'cancelled' });
            this.logger.log(`Marked orphaned ${run.type} run as cancelled: ${runKey}`);
            }
          } else if (run.type === 'letter') {
            const cancelled = await this.letterService.markRunCancelled(runKey);
            if (!cancelled) {
              await this.streamingRuns.updateRun(run.type, runKey, { status: 'cancelled' });
              this.logger.log(`Marked orphaned ${run.type} run as cancelled: ${runKey}`);
            } else {
              this.logger.log(`Cancelled ${run.type} run: ${runKey}`);
            }
          } else {
            await this.streamingRuns.updateRun(run.type, runKey, { status: 'cancelled' });
            this.logger.log(`Cancelled ${run.type} run: ${runKey}`);
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
    const LETTER_STALE_THRESHOLD_MS = this.letterService.getRunTtlMs() + 2 * 60 * 1000; // Letter TTL + buffer
    const RESEARCH_STALE_THRESHOLD_MS = BACKGROUND_POLL_TIMEOUT_MS + (5 * 60 * 1000); // 45 minutes

    this.cleanupSweepInterval = setInterval(() => {
      const now = Date.now();
      const cleanedLetter = this.letterService.cleanupStaleRuns(now, LETTER_STALE_THRESHOLD_MS);
      let cleanedResearch = 0;

      // Sweep deep research runs - longer threshold since they can run 30+ minutes
      for (const [key, run] of this.deepResearchRuns.entries()) {
        const age = now - run.startedAt;
        const isStale = age > RESEARCH_STALE_THRESHOLD_MS;
        const isTerminated = run.status === 'completed' || run.status === 'error';
        
        if (isStale && isTerminated) {
          this.deepResearchRuns.delete(key);
          cleanedResearch++;
          void this.streamingRuns.clearRun('deep_research', key).catch((err) => {
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

  private isOpenAiRelatedError(error: unknown): boolean {
    if (!error || typeof error !== 'object' || error === null) {
      return false;
    }

    const candidate = error as { message?: unknown; code?: unknown };
    const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
    if (message) {
      const keywords = ['openai', 'api key', 'network', 'timeout'];
      if (keywords.some((keyword) => message.includes(keyword))) {
        return true;
      }
    }

    const code = typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '';
    if (code) {
      const codeKeywords = ['openai', 'timeout'];
      if (codeKeywords.some((keyword) => code.includes(keyword))) {
        return true;
      }
    }

    return false;
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
      const client = await this.openAiClient.getClient(apiKey);
      const resp = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: input.prompt }],
        temperature: 0.7,
      });
      this.openAiClient.recordSuccess();
      const content = resp.choices?.[0]?.message?.content ?? '';
      return { content };
    } catch (error) {
      this.openAiClient.handleError(error, 'generate');
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
        `[writing-desk letter] failure ${
          error instanceof Error ? `${error.name}: ${error.message}` : (error as unknown as string)
        }`,
      );
      // Check if this is an OpenAI-related error
      if (this.isOpenAiRelatedError(error)) {
        this.openAiClient.markError('generateWritingDeskFollowUps', error);
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

    return this.letterService.streamLetter(userId, options);
  }

  async ensureLetterRun(
    userId: string,
    requestedJobId: string | null,
    options?: { tone?: string | null; restart?: boolean; createIfMissing?: boolean },
  ): Promise<{ jobId: string; status: 'running' | 'completed' | 'error' }> {
    return this.letterService.ensureLetterRun(userId, requestedJobId, options);
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
      const persisted = await this.streamingRuns.getRun('deep_research', key);
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

    await this.streamingRuns.registerRun({
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

    await this.streamingRuns.touchRun('deep_research', run.key, {
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
  private async executeDeepResearchRun(params: {
    run: DeepResearchRun;
    userId: string;
    baselineJob: ActiveWritingDeskJobResource;
    subject: ReplaySubject<DeepResearchStreamPayload>;
    resumeFromState?: { responseId: string | null; charged: boolean; remainingCredits: number | null };
  }) {
    const { run, userId, baselineJob, subject, resumeFromState } = params;
    const heartbeat = this.streamingRuns.createHeartbeat('deep_research', run.key);
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
        await this.streamingRuns.touchRun('deep_research', run.key, {
          status: 'completed',
          responseId: 'dev-stub',
        });
        await this.streamingRuns.clearRun('deep_research', run.key);
        subject.complete();
        return;
      }

      const prompt = this.buildDeepResearchPrompt(baselineJob, { mpName });
      const client = await this.openAiClient.getClient(apiKey);
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
                await this.streamingRuns.touchRun('deep_research', run.key, {
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
          await this.streamingRuns.touchRun('deep_research', run.key, {
            status: 'completed',
            responseId,
          });
          this.openAiClient.recordSuccess();
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
          await this.streamingRuns.touchRun('deep_research', run.key, {
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
      if (this.isOpenAiRelatedError(error)) {
        this.openAiClient.markError('startDeepResearch', error);
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
      await this.streamingRuns.touchRun('deep_research', run.key, {
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

      await this.streamingRuns.clearRun('deep_research', run.key);
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
      void this.streamingRuns.clearRun('deep_research', run.key).catch((err) => {
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

  async recoverStaleStreamingRuns() {
    try {
      const staleRuns = await this.streamingRuns.findStaleRuns(STREAMING_RUN_ORPHAN_THRESHOLD_MS);
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
      if (state.type === 'letter') {
        await this.letterService.handleOrphanedRun(state);
        return;
      }

      const job = await this.writingDeskJobs.getActiveJobForUser(state.userId);
      if (!job || job.jobId !== state.jobId) {
        await this.streamingRuns.clearRun(state.type, state.runKey);
        return;
      }

      if (state.type === 'deep_research') {
        await this.persistDeepResearchStatus(state.userId, job, 'error');
        if (this.isRunCharged(state)) {
          await this.refundCredits(state.userId, DEEP_RESEARCH_CREDIT_COST);
        }
      }
    } catch (error) {
      this.logger.warn(
        `[streaming-state] Failed to recover run ${state.type}:${state.runKey}: ${(error as Error)?.message ?? error}`,
      );
    } finally {
      if (state.type !== 'letter') {
        await this.streamingRuns.clearRun(state.type, state.runKey);
      }
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
      '- Summarise the MP\'s recent votes, Hansard interventions, committee roles, APPG memberships, stated priorities, and relevant interests. Tie each to potential persuasion angles.',
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

      const client = await this.openAiClient.getClient(apiKey);
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

      this.openAiClient.recordSuccess();

      const bundle = {
        model,
        text: transcription.text || transcription || 'No transcription text received',
        remainingCredits: remainingAfterCharge,
      };
      
      this.logger.log(`[transcription] Processed bundle: ${JSON.stringify(bundle)}`);

      return bundle;
    } catch (error) {
      if (this.isOpenAiRelatedError(error)) {
        this.openAiClient.markError('transcribeAudio', error);
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

          const client = await this.openAiClient.getClient(apiKey);
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
              this.openAiClient.recordSuccess();
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
          if (this.isOpenAiRelatedError(error)) {
            this.openAiClient.markError('streamTranscription', error);
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
