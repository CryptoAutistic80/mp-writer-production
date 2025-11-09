import {
  BadRequestException,
  Injectable,
  Logger,
  MessageEvent,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable, ReplaySubject, Subscription } from 'rxjs';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';

import { UserCreditsService } from '../../../user-credits/user-credits.service';
import { WritingDeskJobsService } from '../../../writing-desk-jobs/writing-desk-jobs.service';
import {
  ActiveWritingDeskJobResource,
  WritingDeskResearchStatus,
} from '../../../writing-desk-jobs/writing-desk-jobs.types';
import { UserMpService } from '../../../user-mp/user-mp.service';
import { StreamingRunManager } from '../../streaming/streaming-run.manager';
import { OpenAiClientService } from '../../openai/openai-client.service';
import { StreamingRunState } from '../../../streaming-state/streaming-state.types';
import { UpsertActiveWritingDeskJobDto } from '../../../writing-desk-jobs/dto/upsert-active-writing-desk-job.dto';
import { extractFirstText, getSupportedReasoningEfforts, isOpenAiRelatedError } from '../../openai/openai.helpers';
import { buildDeepResearchPrompt, buildDeepResearchStub } from './research.helpers';

type DeepResearchStreamPayloadBody =
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

type DeepResearchStreamPayload = DeepResearchStreamPayloadBody & { seq: number };

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
  sequence: number;
}

type ResponseStreamLike = AsyncIterable<ResponseStreamEvent> & {
  controller?: { abort: () => void };
};

interface DeepResearchRequestExtras {
  tools?: Array<Record<string, unknown>>;
  max_tool_calls?: number;
  reasoning?: {
    summary?: 'auto' | 'disabled' | null;
    effort?: 'low' | 'medium' | 'high';
  };
}

export class StreamInactivityTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Stream timed out after ${timeoutMs}ms of inactivity`);
    this.name = 'StreamInactivityTimeoutError';
  }
}

const DEEP_RESEARCH_RUN_BUFFER_SIZE = 2000;
const DEEP_RESEARCH_RUN_TTL_MS = 5 * 60 * 1000;
const RESEARCH_STREAM_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const RESEARCH_MAX_RESUME_ATTEMPTS = 10;
const BACKGROUND_POLL_INTERVAL_MS = 2000;
const BACKGROUND_POLL_TIMEOUT_MS = 40 * 60 * 1000;
const DEEP_RESEARCH_CREDIT_COST = 0.7;

@Injectable()
export class WritingDeskResearchService {
  private readonly logger = new Logger(WritingDeskResearchService.name);
  private readonly researchRuns = new Map<string, DeepResearchRun>();

  constructor(
    private readonly config: ConfigService,
    private readonly userCredits: UserCreditsService,
    private readonly writingDeskJobs: WritingDeskJobsService,
    private readonly userMp: UserMpService,
    private readonly streamingRuns: StreamingRunManager,
    private readonly openAiClient: OpenAiClientService,
  ) {}

  streamResearch(
    userId: string,
    options?: { jobId?: string | null; restart?: boolean; createIfMissing?: boolean },
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let subscription: Subscription | null = null;
      let settled = false;

      const attach = async () => {
        try {
          const run = await this.beginDeepResearchRun(userId, options?.jobId ?? null, {
            restart: options?.restart,
            createIfMissing: options?.createIfMissing,
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

      attach().catch((error) => {
        if (!settled && !subscriber.closed) {
          subscriber.error(error);
        }
      });

      return () => {
        subscription?.unsubscribe();
        subscription = null;
        settled = true;
      };
    });
  }

  async ensureResearchRun(
    userId: string,
    requestedJobId: string | null,
    options?: { restart?: boolean; createIfMissing?: boolean },
  ): Promise<{ jobId: string; status: DeepResearchRunStatus }> {
    const run = await this.beginDeepResearchRun(userId, requestedJobId, options);
    return { jobId: run.jobId, status: run.status };
  }

  async markRunCancelled(runKey: string): Promise<boolean> {
    const run = this.researchRuns.get(runKey);
    if (!run) {
      return false;
    }

    await this.streamingRuns.updateRun('deep_research', runKey, { status: 'cancelled' });
    return true;
  }

  cleanupStaleRuns(now: number, thresholdMs: number): number {
    let cleaned = 0;
    for (const [key, run] of this.researchRuns.entries()) {
      if (run.startedAt + thresholdMs < now) {
        this.researchRuns.delete(key);
        cleaned += 1;
        void this.streamingRuns.clearRun('deep_research', key).catch((error) => {
          this.logger.warn(
            `Failed to clear stale deep research run ${key}: ${(error as Error)?.message ?? error}`,
          );
        });
      }
    }
    return cleaned;
  }

  getRunTtlMs(): number {
    return DEEP_RESEARCH_RUN_TTL_MS;
  }

  async handleOrphanedRun(state: StreamingRunState) {
    try {
      const job = await this.writingDeskJobs.getActiveJobForUser(state.userId);
      if (!job || job.jobId !== state.jobId) {
        await this.streamingRuns.clearRun(state.type, state.runKey);
        return;
      }

      await this.persistDeepResearchStatus(state.userId, job, 'error');
      if (this.isRunCharged(state)) {
        await this.refundCredits(state.userId, DEEP_RESEARCH_CREDIT_COST);
      }
    } catch (error) {
      this.logger.warn(
        `[streaming-state] Failed to recover deep research run ${state.runKey}: ${(error as Error)?.message ?? error}`,
      );
    } finally {
      await this.streamingRuns.clearRun(state.type, state.runKey);
    }
  }

  private async beginDeepResearchRun(
    userId: string,
    requestedJobId: string | null,
    options?: { restart?: boolean; createIfMissing?: boolean },
  ): Promise<DeepResearchRun> {
    const job = await this.resolveActiveWritingDeskJob(userId, requestedJobId);
    const key = this.getDeepResearchRunKey(userId, job.jobId);
    const existing = this.researchRuns.get(key);

    if (existing) {
      if (options?.restart) {
        if (existing.status === 'running') {
          throw new BadRequestException('Deep research is already running. Please wait for it to finish.');
        }
        existing.subject.complete();
        if (existing.cleanupTimer) {
          clearTimeout(existing.cleanupTimer);
        }
        this.researchRuns.delete(key);
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
            job,
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
      jobId: job.jobId,
      subject,
      status: 'running',
      startedAt: Date.now(),
      cleanupTimer: null,
      promise: null,
      responseId: null,
      sequence: 0,
    };

    this.researchRuns.set(key, run);

    await this.streamingRuns.registerRun({
      type: 'deep_research',
      runKey: key,
      userId,
      jobId: job.jobId,
    });

    run.promise = this.executeDeepResearchRun({ run, userId, job, subject }).catch((error) => {
      this.logger.error(`Deep research run encountered an unhandled error: ${(error as Error)?.message ?? error}`);
      subject.error(error);
    });

    return run;
  }

  private async resumeDeepResearchRunFromState(params: {
    persisted: StreamingRunState;
    userId: string;
    job: ActiveWritingDeskJobResource;
  }): Promise<DeepResearchRun> {
    const { persisted, userId, job } = params;
    const subject = new ReplaySubject<DeepResearchStreamPayload>(DEEP_RESEARCH_RUN_BUFFER_SIZE);
    const run: DeepResearchRun = {
      key: persisted.runKey,
      userId,
      jobId: job.jobId,
      subject,
      status: 'running',
      startedAt: persisted.startedAt,
      cleanupTimer: null,
      promise: null,
      responseId: typeof persisted.responseId === 'string' ? persisted.responseId : null,
      sequence: 0,
    };

    this.researchRuns.set(persisted.runKey, run);

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

    run.sequence += 1;
    subject.next({
      seq: run.sequence,
      type: 'status',
      status: 'Reconnecting to your research run…',
      remainingCredits,
    });

    run.promise = this.executeDeepResearchRun({
      run,
      userId,
      job,
      subject,
      resumeFromState: {
        responseId: run.responseId,
        charged,
        remainingCredits,
      },
    }).catch((error) => {
      this.logger.error(`Deep research resume encountered an error: ${(error as Error)?.message ?? error}`);
      subject.error(error);
    });

    return run;
  }

  private async executeDeepResearchRun(params: {
    run: DeepResearchRun;
    userId: string;
    job: ActiveWritingDeskJobResource;
    subject: ReplaySubject<DeepResearchStreamPayload>;
    resumeFromState?: { responseId: string | null; charged: boolean; remainingCredits: number | null };
  }) {
    const { run, userId, job, subject, resumeFromState } = params;
    const heartbeat = this.streamingRuns.createHeartbeat('deep_research', run.key);
    let deductionApplied = false;
    let remainingCredits: number | null = resumeFromState?.remainingCredits ?? null;
    let aggregatedText = '';
    let settled = false;
    let openAiStream: ResponseStreamLike | null = null;
    let responseId: string | null = resumeFromState?.responseId ?? run.responseId ?? null;
    let quietPeriodTimer: NodeJS.Timeout | null = null;
    let backgroundPollingNotified = false;
    let timeoutCleanup: (() => void) | null = null;

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
        await this.persistDeepResearchResult(userId, job, {
          responseId: trimmed,
          status: run.status,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to persist deep research response id for user ${userId}: ${(error as Error)?.message ?? error}`,
        );
      }
    };

    const send = (payload: DeepResearchStreamPayloadBody) => {
      run.sequence += 1;
      subject.next({ ...payload, seq: run.sequence });
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
      await this.persistDeepResearchStatus(userId, job, 'running');
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
        const stub = buildDeepResearchStub(job, { mpName });
        for (const chunk of stub.chunks) {
          send({ type: 'delta', text: chunk });
          await this.delay(180);
        }
        await this.persistDeepResearchResult(userId, job, {
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
        await this.streamingRuns.touchRun('deep_research', run.key, {
          status: 'completed',
          responseId: 'dev-stub',
        });
        await this.streamingRuns.clearRun('deep_research', run.key);
        subject.complete();
        return;
      }

      const prompt = buildDeepResearchPrompt(job, { mpName });
      const client = await this.openAiClient.getClient(apiKey);
      const requestExtras = this.buildDeepResearchRequestExtras(model);

      this.logger.log(
        `[writing-desk research] start ${JSON.stringify({
          userId,
          jobId: job.jobId,
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
        // The resume flow must use the streaming endpoint directly so the
        // existing response_id continues without spawning a new background job.
        openAiStream = client.responses.stream(resumeParams) as ResponseStreamLike;
      } else {
        openAiStream = (await client.responses.create({
          model,
          input: prompt,
          // These flags ensure OpenAI persists the response so we can resume or
          // poll for completion if the stream drops. Avoid removing them during
          // future refactors unless the downstream recovery logic changes.
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

      const startQuietPeriodTimer = () => {
        if (quietPeriodTimer) {
          clearTimeout(quietPeriodTimer);
          quietPeriodTimer = null;
        }
        const timer = setTimeout(() => {
          send({
            type: 'event',
            event: {
              type: 'quiet_period',
              message: this.pickQuietPeriodMessage(),
            },
          });
          quietPeriodTimer = null;
          startQuietPeriodTimer();
        }, 5000);
        if (typeof (timer as any)?.unref === 'function') {
          (timer as any).unref();
        }
        quietPeriodTimer = timer as NodeJS.Timeout;
      };

      startQuietPeriodTimer();

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

          const randomMessage = this.pickResumeStatusMessage();
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
            continue;
          }
        }
      };

      while (currentStream) {
        let streamError: unknown = null;

        try {
          // Clean up any previous timeout before creating a new one
          if (timeoutCleanup) {
            timeoutCleanup();
            timeoutCleanup = null;
          }

          const { stream: timeoutWrappedStream, cleanup } = this.createStreamWithTimeout(
            currentStream,
            RESEARCH_STREAM_INACTIVITY_TIMEOUT_MS,
            () => {
              this.logger.warn(`[research] Stream inactivity timeout for job ${job.jobId}`);
              openAiStream?.controller?.abort();
            }
          );
          timeoutCleanup = cleanup;

          for await (const event of timeoutWrappedStream) {
            if (!event) continue;

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
              case 'response.incomplete':
                throw new ServiceUnavailableException('Deep research failed. Please try again later.');
              case 'response.completed': {
                const finalResponse = event.response;
                const resolvedResponseId = (finalResponse as any)?.id ?? responseId ?? null;
                if (resolvedResponseId && resolvedResponseId !== responseId) {
                  await captureResponseId(finalResponse);
                }
                const finalText = extractFirstText(finalResponse) ?? aggregatedText;
                await this.persistDeepResearchResult(userId, job, {
                  content: finalText,
                  responseId: resolvedResponseId,
                  status: 'completed',
                });
                const usage = (finalResponse as any)?.usage ?? null;
                this.logger.log(
                  `[writing-desk research-usage] ${JSON.stringify({
                    userId,
                    jobId: job.jobId,
                    model,
                    responseId: resolvedResponseId,
                    usage,
                  })}`,
                );
                run.status = 'completed';
                settled = true;
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

      if (!settled) {
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
          const finalText = extractFirstText(finalResponse) ?? aggregatedText;
          pushDelta(finalText);
          await this.persistDeepResearchResult(userId, job, {
            content: finalText,
            responseId,
            status: 'completed',
          });
          const usage = (finalResponse as any)?.usage ?? null;
          this.logger.log(
            `[writing-desk research-usage] ${JSON.stringify({
              userId,
              jobId: job.jobId,
              model,
              responseId,
              usage,
            })}`,
          );
          run.status = 'completed';
          settled = true;
          send({
            type: 'complete',
            content: finalText,
            responseId,
            remainingCredits,
            usage: (finalResponse as any)?.usage ?? null,
          });
        } else {
          throw new ServiceUnavailableException('Deep research failed to complete. Please try again later.');
        }
      }

      await this.streamingRuns.touchRun('deep_research', run.key, {
        status: run.status,
        responseId: responseId ?? run.responseId,
      });
      await this.streamingRuns.clearRun('deep_research', run.key);
    } catch (error) {
      if (!settled) {
        run.status = 'error';
        const message =
          error instanceof BadRequestException
            ? error.message
            : error instanceof ServiceUnavailableException
              ? error.message
              : 'Deep research failed. Please try again later.';
        send({ type: 'error', message, remainingCredits });
        subject.complete();
      }

      if (deductionApplied) {
        await this.refundCredits(userId, DEEP_RESEARCH_CREDIT_COST);
      }

      if (isOpenAiRelatedError(error)) {
        this.openAiClient.markError('startDeepResearch', error);
      }
      await this.persistDeepResearchStatus(userId, job, 'error');
      throw error;
    } finally {
      if (quietPeriodTimer) {
        clearTimeout(quietPeriodTimer);
      }
      if (timeoutCleanup) {
        timeoutCleanup();
      }
      await this.persistDeepResearchStatus(userId, job, run.status);
      run.cleanupTimer = this.scheduleRunCleanup(run);
    }
  }

  private scheduleRunCleanup(run: DeepResearchRun) {
    if (run.cleanupTimer) {
      clearTimeout(run.cleanupTimer);
    }

    const timer = setTimeout(() => {
      this.researchRuns.delete(run.key);
      void this.streamingRuns.clearRun('deep_research', run.key).catch((error) => {
        this.logger.warn(
          `Failed to clear deep research run ${run.key}: ${(error as Error)?.message ?? error}`,
        );
      });
    }, DEEP_RESEARCH_RUN_TTL_MS);

    if (typeof (timer as any)?.unref === 'function') {
      (timer as any).unref();
    }

    return timer as NodeJS.Timeout;
  }

  private getDeepResearchRunKey(userId: string, jobId: string): string {
    return `${userId}::${jobId}`;
  }

  private async resolveActiveWritingDeskJob(
    userId: string,
    requestedJobId: string | null,
  ): Promise<ActiveWritingDeskJobResource> {
    const job = await this.writingDeskJobs.getActiveJobForUser(userId);
    if (!job) {
      throw new BadRequestException('No writing desk job found. Please start a new letter.');
    }

    if (requestedJobId && job.jobId !== requestedJobId) {
      throw new BadRequestException('The requested writing desk job is no longer active.');
    }

    return job;
  }

  private async resolveUserMpName(userId: string): Promise<string | null> {
    try {
      const mpRecord = await this.userMp.getMine(userId);
      const mp: any = (mpRecord as any)?.mp ?? (mpRecord as any) ?? {};
      const name = mp?.name;
      return typeof name === 'string' && name.trim().length > 0 ? name.trim() : null;
    } catch (error) {
      this.logger.warn(`Failed to resolve MP name for user ${userId}: ${(error as Error)?.message ?? error}`);
      return null;
    }
  }

  private async persistDeepResearchStatus(
    userId: string,
    job: ActiveWritingDeskJobResource,
    status: WritingDeskResearchStatus,
  ) {
    const payload = this.buildBaseUpsertPayload(job);
    payload.researchStatus = status;
    await this.writingDeskJobs.upsertActiveJob(userId, payload);
  }

  private async persistDeepResearchResult(
    userId: string,
    job: ActiveWritingDeskJobResource,
    result: {
      content?: string | null;
      responseId?: string | null;
      status?: DeepResearchRunStatus;
    },
  ) {
    const payload = this.buildBaseUpsertPayload(job);
    const nextContent = this.normaliseResearchContent(result.content ?? null);

    payload.researchContent = nextContent ?? undefined;
    payload.researchResponseId = result.responseId ?? undefined;
    payload.researchStatus = result.status ?? job.researchStatus ?? 'completed';

    await this.writingDeskJobs.upsertActiveJob(userId, payload);
  }

  private buildBaseUpsertPayload(job: ActiveWritingDeskJobResource): UpsertActiveWritingDeskJobDto {
    const payload: UpsertActiveWritingDeskJobDto = {
      jobId: job.jobId,
      phase: job.phase,
      stepIndex: job.stepIndex,
      followUpIndex: job.followUpIndex,
      form: job.form,
      followUpQuestions: job.followUpQuestions,
      followUpAnswers: job.followUpAnswers,
    };

    const researchContent = this.normaliseResearchContent(job.researchContent ?? null);
    if (researchContent) {
      payload.researchContent = researchContent;
    }

    if (job.researchResponseId) {
      payload.researchResponseId = job.researchResponseId;
    }

    if (job.researchStatus) {
      payload.researchStatus = job.researchStatus;
    }

    if (job.letterStatus) {
      payload.letterStatus = job.letterStatus;
    }

    const letterContent = this.normaliseResearchContent(job.letterContent ?? null);
    if (letterContent) {
      payload.letterContent = letterContent;
    }

    const letterJson = this.normaliseResearchContent(job.letterJson ?? null);
    if (letterJson) {
      payload.letterJson = letterJson;
    }

    if (job.letterResponseId) {
      payload.letterResponseId = job.letterResponseId;
    }

    return payload;
  }

  private normaliseResearchContent(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
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

    const supportedEfforts = getSupportedReasoningEfforts(model);
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

  private parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
    if (typeof raw !== 'string') return fallback;
    const normalised = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalised)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalised)) return false;
    return fallback;
  }

  private parseOptionalInt(raw: string | undefined): number | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async refundCredits(userId: string, amount: number) {
    try {
      await this.userCredits.addToMine(userId, amount);
    } catch (error) {
      this.logger.warn(
        `Failed to refund credits for user ${userId}: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  private isRunCharged(state: StreamingRunState): boolean {
    const charged = (state.meta as Record<string, unknown> | null | undefined)?.charged;
    return charged === true;
  }

  private pickResumeStatusMessage(): string {
    const messages = [
      'Rummaging through my collection of parliamentary tea leaves…',
      'Having a brief conference with the spirits of democracy…',
      'Processing the evidence through my parliamentary crystal ball…',
      'Taking a step back to see the bigger picture…',
      'Consulting the ancient texts of parliamentary procedure…',
      "Having a quick think about what I've discovered…",
      'Cross-checking my findings with the parliamentary archives…',
      'Taking a moment to connect the dots…',
      'Having a quiet word with the parliamentary librarians…',
      'Processing the information through my democratic filters…',
      'Taking a breather to let the evidence sink in…',
      'Having a brief consultation with the wisdom of ages…',
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  private pickQuietPeriodMessage(): string {
    const messages = [
      'Taking a moment to connect the dots…',
      'Cross-referencing those findings with another trusted source…',
      'Linking fresh evidence into the research trail…',
      'Organising the notes so the next update is crystal clear…',
      'Double-checking citations to keep things watertight…',
      'Following up on a promising lead from the last result…',
      'Letting the dust settle while the insights take shape…',
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  private normaliseStreamEvent(event: ResponseStreamEvent): Record<string, unknown> {
    const payload: Record<string, unknown> = { type: event.type };
    if ((event as any)?.id) {
      payload.id = (event as any).id;
    }
    if ((event as any)?.cursor) {
      payload.cursor = (event as any).cursor;
    }
    const candidate = event as unknown as Record<string, unknown>;
    if (candidate.delta !== undefined) {
      payload.delta = candidate.delta;
    }
    if (candidate.content !== undefined) {
      payload.content = candidate.content;
    }
    if (candidate.output !== undefined) {
      payload.output = candidate.output;
    }
    if (candidate.response) {
      payload.responseId = (candidate.response as any)?.id ?? null;
    }
    if (candidate.error !== undefined) {
      payload.error = candidate.error;
    }
    if (candidate.reasoning !== undefined) {
      payload.reasoning = candidate.reasoning;
    }
    if (candidate.reasoning_summary !== undefined) {
      payload.reasoning_summary = candidate.reasoning_summary;
    }
    if (candidate.summary !== undefined) {
      payload.summary = candidate.summary;
    }
    if (candidate.text !== undefined) {
      payload.text = candidate.text;
    }
    if (candidate.message !== undefined) {
      payload.message = candidate.message;
    }
    if (candidate.part !== undefined) {
      payload.part = candidate.part;
    }
    if (candidate.snapshot !== undefined) {
      payload.snapshot = candidate.snapshot;
    }
    return payload;
  }

  private async waitForBackgroundResponseCompletion(client: any, responseId: string) {
    const start = Date.now();
    while (Date.now() - start < BACKGROUND_POLL_TIMEOUT_MS) {
      const response = await client.responses.retrieve(responseId);
      const status = (response as any)?.status;
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        return response;
      }
      await this.delay(BACKGROUND_POLL_INTERVAL_MS);
    }
    throw new ServiceUnavailableException('Deep research timed out. Please try again later.');
  }

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private createStreamWithTimeout<T>(
    stream: AsyncIterable<T>,
    timeoutMs: number,
    onTimeout: () => void,
  ): { stream: AsyncIterable<T>; cleanup: () => void } {
    const self = this;
    let timeout: NodeJS.Timeout | null = null;
    let pendingReject: ((reason?: unknown) => void) | null = null;
    let timedOutError: StreamInactivityTimeoutError | null = null;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      pendingReject = null;
    };

    const wrappedStream = {
      [Symbol.asyncIterator](): AsyncIterator<T> {
        const iterator = stream[Symbol.asyncIterator]();

        const schedule = () => {
          if (timeout) {
            clearTimeout(timeout);
          }
          timeout = setTimeout(() => {
            if (timedOutError) {
              return;
            }
            timedOutError = new StreamInactivityTimeoutError(timeoutMs);
            try {
              onTimeout();
            } catch (error) {
              self.logger.warn(
                `Timeout handler threw an error: ${(error as Error)?.message ?? error}`,
              );
            }
            const reject = pendingReject;
            pendingReject = null;
            cleanup();
            reject?.(timedOutError);
            iterator.return?.(undefined as any).catch((error) => {
              self.logger.warn(`Failed to abort stream: ${(error as Error)?.message ?? error}`);
            });
          }, timeoutMs);
          if (typeof (timeout as any)?.unref === 'function') {
            (timeout as any).unref();
          }
        };
        schedule();

        return {
          async next() {
            if (timedOutError) {
              const error = timedOutError;
              timedOutError = null;
              throw error;
            }

            schedule();

            let localReject: ((reason?: unknown) => void) | null = null;
            const timeoutPromise = new Promise<IteratorResult<T>>((_, reject) => {
              localReject = reject;
              pendingReject = reject;
            });

            try {
              const result = await Promise.race([iterator.next(), timeoutPromise]);
              if (result.done) {
                cleanup();
              }
              return result;
            } catch (error) {
              if (error === timedOutError) {
                timedOutError = null;
              }
              throw error;
            } finally {
              if (pendingReject === localReject) {
                pendingReject = null;
              }
            }
          },
          async return(value?: any) {
            cleanup();
            if (iterator.return) {
              return iterator.return(value);
            }
            return { done: true, value: undefined };
          },
          async throw(err?: any) {
            cleanup();
            if (iterator.throw) {
              return iterator.throw(err);
            }
            throw err;
          },
        };
      },
    };

    return { stream: wrappedStream, cleanup };
  }

  private isRecoverableTransportError(error: unknown): boolean {
    if (error instanceof StreamInactivityTimeoutError) {
      return true;
    }

    if (!error || typeof error !== 'object') {
      return false;
    }

    const candidate = error as { code?: unknown; message?: unknown };
    const code = typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '';
    const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';

    if (code) {
      if (
        code.includes('timeout') ||
        code.includes('connection_reset') ||
        code.includes('aborted') ||
        code.includes('premature')
      ) {
        return true;
      }
    }

    if (message) {
      const keywords = ['timeout', 'timed out', 'socket hang up', 'network', 'connection reset', 'premature close', 'aborted'];
      return keywords.some((keyword) => message.includes(keyword));
    }

    return false;
  }
}
