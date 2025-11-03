import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
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
  WritingDeskLetterStatus,
  WritingDeskLetterTone,
  WRITING_DESK_LETTER_TONES,
} from '../../../writing-desk-jobs/writing-desk-jobs.types';
import { UserMpService } from '../../../user-mp/user-mp.service';
import { UsersService } from '../../../users/users.service';
import { UserAddressService } from '../../../user-address-store/user-address.service';
import { StreamingRunManager } from '../../streaming/streaming-run.manager';
import { OpenAiClientService } from '../../openai/openai-client.service';
import { StreamingRunKind, StreamingRunState } from '../../../streaming-state/streaming-state.types';
import { UpsertActiveWritingDeskJobDto } from '../../../writing-desk-jobs/dto/upsert-active-writing-desk-job.dto';
import {
  LETTER_RESPONSE_SCHEMA,
  LETTER_SYSTEM_PROMPT,
  LETTER_TONE_DETAILS,
  LETTER_TONE_REQUEST_PREFIX,
  LETTER_TONE_SIGN_OFFS,
} from './letter.helpers';
import { extractFirstText, getSupportedReasoningEfforts, isOpenAiRelatedError } from '../../openai/openai.helpers';

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

interface LetterContext {
  mpName: string;
  mpAddress1: string;
  mpAddress2: string;
  mpCity: string;
  mpCounty: string;
  mpPostcode: string;
  constituency: string;
  senderName: string;
  senderAddress1: string;
  senderAddress2: string;
  senderAddress3: string;
  senderCity: string;
  senderCounty: string;
  senderPostcode: string;
  senderTelephone: string;
  today: string;
}

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

@Injectable()
export class WritingDeskLetterService {
  private static readonly LETTER_RUN_BUFFER_SIZE = 2000;
  private static readonly LETTER_RUN_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly LETTER_MAX_RESUME_ATTEMPTS = 10;
  private static readonly LETTER_STREAM_INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
  private static readonly LETTER_CREDIT_COST = 0.2;

  private readonly logger = new Logger(WritingDeskLetterService.name);
  private readonly letterRuns = new Map<string, LetterRun>();

  constructor(
    private readonly config: ConfigService,
    private readonly userCredits: UserCreditsService,
    private readonly writingDeskJobs: WritingDeskJobsService,
    private readonly userMp: UserMpService,
    private readonly users: UsersService,
    private readonly userAddress: UserAddressService,
    private readonly streamingRuns: StreamingRunManager,
    private readonly openAiClient: OpenAiClientService,
  ) {}

  streamLetter(
    userId: string,
    options?: { jobId?: string | null; tone?: string | null; resume?: boolean | null },
  ): Observable<MessageEvent> {
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

  getRun(runKey: string): LetterRun | undefined {
    return this.letterRuns.get(runKey);
  }

  async markRunCancelled(runKey: string): Promise<boolean> {
    const run = this.letterRuns.get(runKey);
    if (!run) {
      return false;
    }

    await this.streamingRuns.updateRun('letter', runKey, { status: 'cancelled' });
    return true;
  }

  cleanupStaleRuns(now: number, thresholdMs: number): number {
    let cleaned = 0;
    for (const [key, run] of this.letterRuns.entries()) {
      const age = now - run.startedAt;
      const isStale = age > thresholdMs;
      const isTerminated = run.status === 'completed' || run.status === 'error';

      if (isStale && isTerminated) {
        this.letterRuns.delete(key);
        cleaned += 1;
        void this.streamingRuns.clearRun('letter', key).catch((err) => {
          this.logger.warn(`Failed to clear stale letter run ${key}: ${(err as Error)?.message}`);
        });
      }
    }
    return cleaned;
  }

  getRunTtlMs(): number {
    return WritingDeskLetterService.LETTER_RUN_TTL_MS;
  }

  // --- Private methods replicated from original AiService ---

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
      const persisted = await this.streamingRuns.getRun('letter', key);
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

    const subject = new ReplaySubject<LetterStreamPayload>(WritingDeskLetterService.LETTER_RUN_BUFFER_SIZE);
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

    await this.streamingRuns.registerRun({
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
    const heartbeat = this.streamingRuns.createHeartbeat('letter', run.key);
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
    let lastPreviewHtml: string | null = null;

    const send = (payload: LetterStreamPayload) => {
      subject.next(payload);
      heartbeat();
    };

    const persistProgressIfNeeded = async (html: string) => {
      const now = Date.now();
      const hasChanged = html !== lastPersistedContent;
      const shouldPersist = hasChanged && now - lastPersistedAt > 5000;

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
        await this.persistLetterState(userId, baselineJob, { status: 'generating', responseId: trimmed, tone });
      } catch (error) {
        this.logger.warn(
          `Failed to persist letter response id for user ${userId}: ${(error as Error)?.message ?? error}`,
        );
      }
    };

    const scheduleQuietStatus = (status: string) => {
      if (quietPeriodTimer) {
        clearTimeout(quietPeriodTimer);
      }
      quietPeriodTimer = setTimeout(() => {
        send({ type: 'status', status });
        send({ type: 'event', event: { type: 'quiet_period', message: status } });
      }, 15000);
      if (typeof (quietPeriodTimer as any)?.unref === 'function') {
        (quietPeriodTimer as any).unref();
      }
    };

    try {
      if (resumeFromState?.responseId) {
        deductionApplied = resumeFromState.charged;
        remainingCredits = resumeFromState.remainingCredits ?? run.remainingCredits;
        run.remainingCredits = remainingCredits;
      } else {
        const { credits: creditsAfterCharge } = await this.userCredits.deductFromMine(userId, WritingDeskLetterService.LETTER_CREDIT_COST);
        deductionApplied = true;
        remainingCredits = Math.round(creditsAfterCharge * 100) / 100;
        run.remainingCredits = remainingCredits;
        await this.streamingRuns.touchRun('letter', run.key, {
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
      const prompt = this.buildLetterPrompt({ job: baselineJob, tone, context, research: researchContent });
      const feedEventTypes = new Set([
        'response.web_search_call.searching',
        'response.web_search_call.in_progress',
        'response.web_search_call.completed',
        'response.file_search_call.searching',
        'response.file_search_call.in_progress',
        'response.file_search_call.completed',
        'response.code_interpreter_call.in_progress',
        'response.code_interpreter_call.completed',
        'response.reasoning.delta',
        'response.reasoning.done',
        'response.reasoning_summary.delta',
        'response.reasoning_summary.done',
        'response.reasoning_summary_part.added',
        'response.reasoning_summary_part.done',
        'response.reasoning_summary_text.delta',
        'response.reasoning_summary_text.done',
      ]);

      const sendPreviewUpdate = async () => {
        const previewContent = this.extractLetterPreview(jsonBuffer);
        const previewSubject = this.extractSubjectLinePreview(jsonBuffer);

        if (!previewContent && !previewSubject) {
          return;
        }

        const previewHtml = this.buildLetterDocumentHtml({
          mpName: context.mpName,
          mpAddress1: context.mpAddress1,
          mpAddress2: context.mpAddress2,
          mpCity: context.mpCity,
          mpCounty: context.mpCounty,
          mpPostcode: context.mpPostcode,
          date: context.today,
          subjectLineHtml: previewSubject ?? undefined,
          letterContentHtml: previewContent ?? undefined,
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

        if (previewHtml && previewHtml !== lastPreviewHtml) {
          lastPreviewHtml = previewHtml;
          send({ type: 'letter_delta', html: previewHtml });
          await persistProgressIfNeeded(previewHtml);
        }
      };

      const finaliseRunFromJson = async (resultJson: string, responseIdOverride: string | null) => {
        const trimmed = typeof resultJson === 'string' ? resultJson.trim() : '';
        if (trimmed.length === 0) {
          throw new InternalServerErrorException('Letter response was empty. Please try again.');
        }

        const resolvedResponseId = responseIdOverride ?? responseId ?? run.responseId;
        const parsed = this.parseLetterResult(trimmed);
        const contextForMerge = await this.resolveLetterContext(userId);
        const merged = this.mergeLetterResultWithContext(parsed, contextForMerge);
        const references = this.extractReferencesFromJson(trimmed);
        const finalDocumentHtml = this.buildLetterDocumentHtml({
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
          responseId: resolvedResponseId,
          content: finalDocumentHtml,
          references,
          json: trimmed,
        });

        jsonBuffer = trimmed;
        run.status = 'completed';
        run.responseId = resolvedResponseId;
        _settled = true;
        lastPreviewHtml = finalDocumentHtml;
        send({ type: 'letter_delta', html: finalDocumentHtml });
        send({
          type: 'complete',
          letter: this.toLetterCompletePayload(merged, {
            responseId: resolvedResponseId,
            tone,
            rawJson: trimmed,
            html: finalDocumentHtml,
          }),
          remainingCredits,
        });
        await this.streamingRuns.touchRun('letter', run.key, {
          status: 'completed',
          responseId: resolvedResponseId,
          meta: { tone, charged: deductionApplied, remainingCredits },
        });
        this.openAiClient.recordSuccess();
        subject.complete();
      };

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

        await this.persistLetterResult(userId, baselineJob, {
          status: 'completed',
          tone,
          responseId: 'dev-stub',
          content: stubDocument,
          references: stub.references,
          json: JSON.stringify(stub),
        });
        run.status = 'completed';
        _settled = true;
        send({ type: 'letter_delta', html: stubDocument });
        send({
          type: 'complete',
          letter: this.toLetterCompletePayload(
            { ...stub, letter_content: stubDocument },
            { responseId: 'dev-stub', tone, rawJson: JSON.stringify(stub), html: stubDocument },
          ),
          remainingCredits,
        });
        await this.streamingRuns.touchRun('letter', run.key, {
          status: 'completed',
          responseId: 'dev-stub',
          meta: { tone },
        });
        await this.streamingRuns.clearRun('letter', run.key);
        subject.complete();

        if (quietPeriodTimer) {
          clearTimeout(quietPeriodTimer);
          quietPeriodTimer = null;
        }
        return;
      }

      const client = await this.openAiClient.getClient(apiKey);
      const letterResponseSchema = this.buildLetterResponseSchema(context);

      const createLetterStreamFromPrompt = () =>
        client.responses.stream({
          model,
          input: [
            { role: 'system', content: [{ type: 'input_text', text: LETTER_SYSTEM_PROMPT }] },
            { role: 'user', content: [{ type: 'input_text', text: prompt }] },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'mp_letter',
              strict: true,
              schema: letterResponseSchema,
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
      let streamError: unknown = null;

      const handleStreamEvent = async (event: ResponseStreamEvent) => {
        const normalised = this.normaliseStreamEvent(event);
        const eventType = (normalised as any)?.type ?? (normalised as any)?.event_type ?? null;
        const sequenceNumber = (event as any)?.sequence_number ?? (normalised as any)?.sequence_number ?? null;
        if (Number.isFinite(sequenceNumber)) {
          lastSequenceNumber = Number(sequenceNumber);
        }

        const eventCursor =
          typeof (event as any)?.id === 'string'
            ? (event as any).id
            : typeof (event as any)?.cursor === 'string'
              ? (event as any).cursor
              : typeof (normalised as any)?.event_id === 'string'
                ? (normalised as any).event_id
                : typeof (normalised as any)?.cursor === 'string'
                  ? (normalised as any).cursor
                  : null;
        if (eventCursor) {
          lastCursor = eventCursor;
        }

        if ((event as any)?.response) {
          await captureResponseId((event as any).response);
        }

        if (eventType && feedEventTypes.has(eventType)) {
          send({ type: 'event', event: normalised });
          return;
        }

        if (eventType === 'response.refusal.delta') {
          send({
            type: 'delta',
            text:
              'The model declined to respond. Please check your prompt or try again shortly.\n',
          });
        }

        if (eventType === 'response.error') {
          const message = typeof (normalised as any)?.error?.message === 'string'
            ? (normalised as any).error.message
            : 'Letter composition failed. Please try again in a few moments.';
          throw new Error(message);
        }

        if (eventType === 'response.created' || eventType === 'response.in_progress') {
          await captureResponseId((normalised as any)?.response);
          if ((normalised as any)?.response?.status === 'completed') {
            run.status = 'completed';
            heartbeat({ status: 'completed', responseId: responseId ?? run.responseId });
          }
        }

        if (eventType === 'response.output_text.delta') {
          const delta = this.extractOutputTextDelta(normalised);
          if (delta) {
            jsonBuffer += delta;
            send({ type: 'delta', text: delta });
            scheduleQuietStatus('Still drafting your letter…');
            await sendPreviewUpdate();
          }
        }

        if (eventType === 'response.output_text.done') {
          const text = extractFirstText((normalised as any)?.response) ?? jsonBuffer;
          if (typeof text === 'string' && text.length > 0) {
            jsonBuffer = text;
            scheduleQuietStatus('Finishing letter formatting…');
            await sendPreviewUpdate();
          }
        }

        if (eventType === 'response.completed') {
          const responseObj = (normalised as any)?.response;
          await captureResponseId(responseObj);
          run.status = 'completed';
          heartbeat({ status: 'completed', responseId: responseObj?.id ?? responseId ?? run.responseId });

          const finalText = extractFirstText(responseObj) ?? jsonBuffer;
          if (typeof finalText === 'string' && finalText.length > 0) {
            jsonBuffer = finalText;
            await sendPreviewUpdate();
          }
        }
      };

      const attemptStreamResume = async (error: unknown): Promise<ResponseStreamLike | null> => {
        if (!this.isRecoverableTransportError(error)) {
          return null;
        }

        if (!responseId || resumeAttempts >= WritingDeskLetterService.LETTER_MAX_RESUME_ATTEMPTS) {
          return null;
        }

        resumeAttempts += 1;
        this.logger.warn(
          `[writing-desk letter] stream interruption (attempt ${resumeAttempts}/${WritingDeskLetterService.LETTER_MAX_RESUME_ATTEMPTS})`,
        );

        scheduleQuietStatus('Connection lost momentarily. Reconnecting…');
        send({
          type: 'event',
          event: {
            type: 'resume_attempt',
            message: 'Connection lost momentarily. Reconnecting…',
            attempt: resumeAttempts,
          },
        });

        const params: Record<string, unknown> = {
          response_id: responseId,
          cursor: lastCursor ?? undefined,
        };
        if (lastSequenceNumber !== null) {
          params.after = lastSequenceNumber;
        }

        try {
          const resumed = (await client.responses.stream(params)) as ResponseStreamLike;
          return resumed;
        } catch (resumeError) {
          this.logger.warn(
            `[writing-desk letter] failed to resume stream: ${(resumeError as Error)?.message ?? resumeError}`,
          );
          return null;
        }
      };

      const wrapStream = (stream: ResponseStreamLike): AsyncIterable<ResponseStreamEvent> => {
        trackedControllers.push(stream.controller ?? { abort: () => undefined });
        return this.createStreamWithTimeout(
          stream,
          WritingDeskLetterService.LETTER_STREAM_INACTIVITY_TIMEOUT_MS,
          () => {
            this.logger.warn(`[writing-desk letter] Stream inactivity timeout for user ${userId}`);
          },
        );
      };

      if (resumeFromState?.responseId) {
        const resumeParams: Record<string, unknown> = {
          response_id: resumeFromState.responseId,
        };
        openAiStream = wrapStream((await client.responses.stream(resumeParams)) as ResponseStreamLike);
      } else {
        openAiStream = wrapStream(createLetterStreamFromPrompt());
      }

      currentStream = openAiStream;

      while (currentStream) {
        streamError = null;
        try {
          for await (const event of currentStream) {
            await handleStreamEvent(event);
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
          currentStream = wrapStream(resumedStream);
          openAiStream = currentStream;
        }
      }

      if (!_settled) {
        if (run.status === 'completed' && typeof jsonBuffer === 'string' && jsonBuffer.trim().length > 0) {
          try {
            await finaliseRunFromJson(jsonBuffer, responseId);
          } catch (error) {
            this.logger.warn(
              `[writing-desk letter] failed to finalise streamed letter directly: ${(error as Error)?.message ?? error}`,
            );
          }
        }
      }

      if (!_settled) {
        if (!responseId) {
          throw new ServiceUnavailableException('Letter stream ended unexpectedly. Please try again.');
        }

        this.logger.warn(
          `[writing-desk letter] stream ended early for response ${responseId}, polling for completion`,
        );

        send({ type: 'status', status: 'Finishing up in the background…', remainingCredits });

        const finalResponse = await this.waitForBackgroundResponseCompletion(client, responseId, {
          taskName: 'Letter composition',
          logContext: 'writing-desk letter',
          timeoutMessage: 'Letter composition is taking longer than expected. Please try again shortly.',
        });

        const finalStatus = (finalResponse as any)?.status ?? 'completed';
        const finalText = extractFirstText(finalResponse) ?? jsonBuffer;
        jsonBuffer = typeof finalText === 'string' ? finalText : jsonBuffer;

        if (finalStatus === 'completed') {
          const resultJson = jsonBuffer || finalText;
          await finaliseRunFromJson(resultJson as string, responseId);
        } else {
          const message = this.buildBackgroundFailureMessage(finalResponse, finalStatus);
          await this.persistLetterState(userId, baselineJob, { status: 'error', tone, responseId });
          run.status = 'error';
          _settled = true;
          send({ type: 'error', message, remainingCredits });
          await this.streamingRuns.touchRun('letter', run.key, {
            status: 'error',
            responseId,
          });
          subject.complete();
        }
      }

      if (quietPeriodTimer) {
        clearTimeout(quietPeriodTimer);
        quietPeriodTimer = null;
      }
    } catch (error) {
      if (isOpenAiRelatedError(error)) {
        this.openAiClient.markError('generateLetterForUser', error);
      }

      if (deductionApplied) {
        await this.refundCredits(userId, WritingDeskLetterService.LETTER_CREDIT_COST);
        if (typeof remainingCredits === 'number') {
          remainingCredits = Math.round((remainingCredits + WritingDeskLetterService.LETTER_CREDIT_COST) * 100) / 100;
        }
      }

      run.status = 'error';

      const errorContext = {
        errorType: 'LETTER_COMPOSITION_FAILED',
        userId,
        jobId: baselineJob.jobId,
        tone,
        status: run.status,
        responseId: responseId ?? run.responseId,
        creditsCharged: deductionApplied,
        remainingCredits,
        runDuration: Date.now() - run.startedAt,
        quietPeriodTimerActive: quietPeriodTimer !== null,
        errorMessage: (error as Error)?.message ?? 'Unknown error',
      };

      this.logger.error(`LETTER_COMPOSITION_ERROR: ${errorContext.errorMessage}`, errorContext);

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
      await this.streamingRuns.touchRun('letter', run.key, {
        status: 'error',
        responseId: run.responseId,
      });
      subject.complete();

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

      await this.streamingRuns.clearRun('letter', run.key);
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
      void this.streamingRuns.clearRun('letter', run.key).catch((err) => {
        this.logger.warn(`Failed to clear letter run ${run.key}: ${(err as Error)?.message}`);
      });
    }, WritingDeskLetterService.LETTER_RUN_TTL_MS);
    if (typeof (timer as any)?.unref === 'function') {
      (timer as any).unref();
    }
    run.cleanupTimer = timer as NodeJS.Timeout;
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

    const subject = new ReplaySubject<LetterStreamPayload>(WritingDeskLetterService.LETTER_RUN_BUFFER_SIZE);
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

    await this.streamingRuns.touchRun('letter', run.key, {
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

  private async resolveLetterContext(userId: string): Promise<LetterContext> {
    const [user, mpRecord, addressRecord] = await Promise.all([
      this.users.findById(userId),
      this.userMp.getMine(userId),
      this.userAddress.getMine(userId),
    ]);

    const mp = (mpRecord as any)?.mp ?? (mpRecord as any) ?? {};
    const address = (addressRecord as any)?.address ?? (addressRecord as any) ?? {};
    const sender = (user as any) ?? {};

    const today = new Date().toISOString().slice(0, 10);

    const normalise = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

    const pickAddressValue = (source: Record<string, unknown> | undefined, keys: string[]): string => {
      if (!source) return '';
      for (const key of keys) {
        const value = source[key];
        const normalised = normalise(value);
        if (normalised.length > 0) {
          return normalised;
        }
      }
      return '';
    };

    const correspondenceAddress = (mp?.correspondenceAddress ??
      (typeof mp?.address === 'object' ? mp.address : null)) as Record<string, unknown> | null;

    const parliamentaryAddressLinesRaw =
      typeof mp?.parliamentaryAddress === 'string'
        ? mp.parliamentaryAddress
            .split(/[\n,]+/)
            .map((part: string) => part.trim())
            .filter((part: string) => part.length > 0)
        : [];
    const postcodeRegex = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
    const fallbackParts = [...parliamentaryAddressLinesRaw];
    let fallbackPostcode = '';
    const postcodeIndex = fallbackParts.findIndex((part) => postcodeRegex.test(part));
    if (postcodeIndex !== -1) {
      fallbackPostcode = fallbackParts.splice(postcodeIndex, 1)[0] ?? '';
    }
    const fallbackLine1 = fallbackParts.shift() ?? '';
    const fallbackLine2 = fallbackParts.shift() ?? '';
    const fallbackCity = fallbackParts.shift() ?? '';
    const fallbackCounty = fallbackParts.shift() ?? '';

    const mpAddress1 =
      pickAddressValue(correspondenceAddress ?? undefined, [
        'line1',
        'addressLine1',
        'line_1',
        'address_line_1',
        'address1',
      ]) || fallbackLine1;
    const mpAddress2 =
      pickAddressValue(correspondenceAddress ?? undefined, [
        'line2',
        'addressLine2',
        'line_2',
        'address_line_2',
        'address2',
      ]) || fallbackLine2;
    const mpCity =
      pickAddressValue(correspondenceAddress ?? undefined, [
        'city',
        'town',
        'postTown',
        'locality',
        'borough',
      ]) || fallbackCity;
    const mpCounty =
      pickAddressValue(correspondenceAddress ?? undefined, [
        'county',
        'region',
        'state',
        'district',
        'area',
      ]) || fallbackCounty;
    const mpPostcode =
      pickAddressValue(correspondenceAddress ?? undefined, [
        'postcode',
        'postCode',
        'postalCode',
        'zip',
      ]) || fallbackPostcode;

    return {
      mpName: normalise(mp?.name) || normalise((mp as any)?.nameDisplayAs) || '',
      mpAddress1,
      mpAddress2,
      mpCity,
      mpCounty,
      mpPostcode,
      constituency: mp?.constituency?.trim?.() || '',
      senderName: sender?.displayName?.trim?.() || sender?.name?.trim?.() || '',
      senderAddress1: address?.line1?.trim?.() || '',
      senderAddress2: address?.line2?.trim?.() || '',
      senderAddress3: address?.line3?.trim?.() || '',
      senderCity: address?.city?.trim?.() || '',
      senderCounty: address?.county?.trim?.() || '',
      senderPostcode: address?.postcode?.trim?.() || '',
      senderTelephone: address?.telephone?.trim?.() || '',
      today,
    };
  }

  private buildLetterPrompt(params: {
    job: ActiveWritingDeskJobResource;
    tone: WritingDeskLetterTone;
    context: LetterContext;
    research: string;
  }): string {
    const { job, tone, context, research } = params;
    const toneDetail = LETTER_TONE_DETAILS[tone];
    const intake = job.form?.issueDescription ?? '';
    const followUps = Array.isArray(job.followUpQuestions)
      ? job.followUpQuestions
          .map((question, index) => {
            const answer = job.followUpAnswers?.[index] ?? '';
            if (!question && !answer) return null;
            return `Question: ${question}\nAnswer: ${answer}`;
          })
          .filter((entry): entry is string => !!entry)
      : [];

    const followUpSection =
      followUps.length > 0 ? followUps.join('\n\n') : 'No follow-up questions were required.';

    const researchSection = research || 'No deep research findings were available.';

    const sections = [
      `Selected tone: ${toneDetail.label}. ${toneDetail.prompt}`,
      `Today's date: ${context.today}`,
      `MP profile:\n- Name: ${context.mpName || 'Unknown'}\n- Constituency: ${context.constituency || 'Unknown'}\n- Parliamentary address line 1: ${context.mpAddress1 || ''}\n- Parliamentary address line 2: ${context.mpAddress2 || ''}\n- Parliamentary city: ${context.mpCity || ''}\n- Parliamentary county: ${context.mpCounty || ''}\n- Parliamentary postcode: ${context.mpPostcode || ''}`,
      `Sender profile:\n- Name: ${context.senderName || ''}\n- Address line 1: ${context.senderAddress1 || ''}\n- Address line 2: ${context.senderAddress2 || ''}\n- Address line 3: ${context.senderAddress3 || ''}\n- City: ${context.senderCity || ''}\n- County: ${context.senderCounty || ''}\n- Postcode: ${context.senderPostcode || ''}`,
      `Sender profile:\n- Name: ${context.senderName || ''}\n- Address line 1: ${context.senderAddress1 || ''}\n- Address line 2: ${context.senderAddress2 || ''}\n- Address line 3: ${context.senderAddress3 || ''}\n- City: ${context.senderCity || ''}\n- County: ${context.senderCounty || ''}\n- Postcode: ${context.senderPostcode || ''}\n- Telephone: ${context.senderTelephone || ''}`,
      `User intake description:\n${intake}`,
      `Follow-up details:\n${followUpSection}`,
      `Deep research findings:\n${researchSection}`,
    ];

    return sections.join('\n\n');
  }

  private buildLetterSystemPrompt(): string {
    return LETTER_SYSTEM_PROMPT;
  }

  private buildLetterResponseSchema(context: LetterContext) {
    const schema = JSON.parse(JSON.stringify(LETTER_RESPONSE_SCHEMA)) as Record<string, any>;
    const normalise = (value: string | null | undefined): string => {
      if (typeof value !== 'string') return '';
      return this.normaliseLetterTypography(value.trim());
    };

    const setFlexibleProperty = (key: string, value: string | null | undefined) => {
      const property = schema.properties?.[key];
      if (!property || typeof property !== 'object') {
        return;
      }
      delete property.const;
      const normalised = normalise(value);
      if (normalised.length > 0) {
        property.default = normalised;
      } else {
        delete property.default;
      }
    };

    setFlexibleProperty('mp_name', context.mpName);
    setFlexibleProperty('mp_address_1', context.mpAddress1);
    setFlexibleProperty('mp_address_2', context.mpAddress2);
    setFlexibleProperty('mp_city', context.mpCity);
    setFlexibleProperty('mp_county', context.mpCounty);
    setFlexibleProperty('mp_postcode', context.mpPostcode);
    setFlexibleProperty('date', context.today);
    setFlexibleProperty('sender_name', context.senderName);
    setFlexibleProperty('sender_address_1', context.senderAddress1);
    setFlexibleProperty('sender_address_2', context.senderAddress2);
    setFlexibleProperty('sender_address_3', context.senderAddress3);
    setFlexibleProperty('sender_city', context.senderCity);
    setFlexibleProperty('sender_county', context.senderCounty);
    setFlexibleProperty('sender_postcode', context.senderPostcode);
    setFlexibleProperty('sender_phone', context.senderTelephone);

    return schema;
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

    const requestPrefix = LETTER_TONE_REQUEST_PREFIX[tone] ?? LETTER_TONE_REQUEST_PREFIX.neutral;
    const request = `${requestPrefix} raise this issue with the relevant authorities, outline the steps you can take, and keep me informed of any progress.`;
    const signOff = LETTER_TONE_SIGN_OFFS[tone] ?? LETTER_TONE_SIGN_OFFS.neutral;
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
    const mpName = normalise(input.mpName);
    let mpAddress1 = normalise(input.mpAddress1);
    let mpAddress2 = normalise(input.mpAddress2);
    let mpCity = normalise(input.mpCity);
    let mpCounty = normalise(input.mpCounty);
    let mpPostcode = normalise(input.mpPostcode);

    const hasParliamentaryAddressDetail = [mpAddress1, mpAddress2, mpCity, mpCounty, mpPostcode].some(
      (value) => value.length > 0,
    );
    const fallbackAddress1 = 'House of Commons';
    const fallbackCity = 'London';
    const fallbackPostcode = 'SW1A 0AA';

    if (!hasParliamentaryAddressDetail) {
      mpAddress1 = fallbackAddress1;
      mpCity = fallbackCity;
      mpPostcode = fallbackPostcode;
    } else {
      if (!mpAddress1) {
        mpAddress1 = fallbackAddress1;
      }
      if (!mpCity) {
        mpCity = fallbackCity;
      }
      if (!mpPostcode) {
        mpPostcode = fallbackPostcode;
      }
    }

    const mpLines = this.buildAddressLines({
      name: mpName,
      line1: mpAddress1,
      line2: mpAddress2,
      line3: null,
      city: mpCity,
      county: mpCounty,
      postcode: mpPostcode,
    }).filter((line, index, array) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return array.findIndex((entry) => entry.trim().toLowerCase() === trimmed.toLowerCase()) === index;
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
    return addressDetail.length > 0;
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
    extras: { responseId: string | null; tone: WritingDeskLetterTone; rawJson: string; html: string },
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
      letterContent: extras.html,
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
    const marker = `"${field}"`;
    let index = buffer.lastIndexOf(marker);
    if (index === -1) return null;

    index += marker.length;
    while (index < buffer.length && /\s/.test(buffer[index])) {
      index += 1;
    }
    if (index >= buffer.length || buffer[index] !== ':') {
      return null;
    }
    index += 1;

    while (index < buffer.length && /\s/.test(buffer[index])) {
      index += 1;
    }
    if (index >= buffer.length || buffer[index] !== '"') {
      return null;
    }
    index += 1;

    let result = '';
    let escaped = false;
    for (; index < buffer.length; index += 1) {
      const char = buffer[index];

      if (escaped) {
        switch (char) {
          case 'n':
          case 'r':
            result += '\n';
            break;
          case 't':
            result += '\t';
            break;
          case '"':
          case '\\':
          case '/':
            result += char;
            break;
          case 'u': {
            const hex = buffer.slice(index + 1, index + 5);
            if (/^[0-9a-fA-F]{4}$/.test(hex)) {
              result += String.fromCharCode(parseInt(hex, 16));
              index += 4;
            }
            break;
          }
          default:
            result += char;
        }
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        return result;
      }

      result += char;
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
      if (Array.isArray(parsed?.references)) {
        return parsed.references
          .filter((ref: unknown): ref is string => typeof ref === 'string')
          .map((ref: string) => ref.trim())
          .filter((ref: string) => ref.length > 0);
      }
    } catch {
      // ignore
    }
    return [];
  }

  private normaliseLetterResultTypography(result: WritingDeskLetterResult): WritingDeskLetterResult {
    return {
      ...result,
      letter_content: this.normaliseLetterTypography(result.letter_content),
      subject_line_html: this.normaliseLetterTypography(result.subject_line_html),
    };
  }

  private normaliseLetterTypography(value: string): string {
    return value
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/\u00a0/g, ' ');
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
    const supported = getSupportedReasoningEfforts(model);
    const requested = raw?.trim?.().toLowerCase?.();
    if (requested && (supported as readonly string[]).includes(requested)) {
      return requested as 'low' | 'medium' | 'high';
    }
    return supported.includes('medium') ? 'medium' : supported[0];
  }

  private normaliseResearchContent(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const normalised = value.replace(/\r\n/g, '\n');
    return normalised.trim().length > 0 ? normalised : null;
  }

  private async waitForBackgroundResponseCompletion(
    client: any,
    responseId: string,
    options?: { taskName?: string; timeoutMessage?: string; logContext?: string },
  ) {
    const startedAt = Date.now();
    const timeoutMessage = options?.timeoutMessage ?? 'Letter composition timed out. Please try again.';
    const logContext = options?.logContext ?? 'letter';

    while (true) {
      try {
        const response = await client.responses.retrieve(responseId);
        const status = (response as any)?.status;
        if (status === 'completed' || status === 'failed' || status === 'cancelled') {
          return response;
        }
      } catch (error) {
        this.logger.warn(
          `[writing-desk ${logContext}] failed to poll response ${responseId}: ${(error as Error)?.message ?? error}`,
        );
        const statusCode =
          typeof (error as any)?.status === 'number'
            ? (error as any).status
            : typeof (error as any)?.statusCode === 'number'
              ? (error as any).statusCode
              : typeof (error as any)?.code === 'number'
                ? (error as any).code
                : undefined;
        const message = typeof (error as any)?.message === 'string' ? (error as any).message : '';
        if (statusCode === 404 || /not found/i.test(message)) {
          throw new ServiceUnavailableException('Letter response could not be recovered. Please try again.');
        }
      }

      if (Date.now() - startedAt > 2 * 60 * 1000) {
        throw new ServiceUnavailableException(timeoutMessage);
      }

      await this.delay(2000);
    }
  }

  private buildBackgroundFailureMessage(response: any, status: string): string {
    const errorMessage =
      response?.error?.message ?? 'The letter could not be completed due to an issue with the AI service.';
    const statusMessage = status === 'failed' ? errorMessage : 'Letter composition stopped before completion.';
    return statusMessage;
  }

  private async resolveActiveWritingDeskJob(
    userId: string,
    requestedJobId: string | null,
  ): Promise<ActiveWritingDeskJobResource> {
    const job = await this.writingDeskJobs.getActiveJobForUser(userId);
    if (!job) {
      throw new BadRequestException(
        'We could not find an active letter to compose. Save your answers and try again.',
      );
    }
    if (requestedJobId && job.jobId !== requestedJobId) {
      throw new BadRequestException(
        'Your saved letter changed. Refresh the page before composing the letter again.',
      );
    }
    return job;
  }

  private async persistLetterState(
    userId: string,
    fallback: ActiveWritingDeskJobResource,
    state: {
      status: WritingDeskLetterStatus;
      tone: WritingDeskLetterTone;
      responseId?: string | null;
      content?: string | null;
      references?: string[] | null;
      json?: string | null;
    },
  ) {
    const latest = await this.writingDeskJobs.getActiveJobForUser(userId);
    const job = latest ?? fallback;
    const payload = this.buildLetterUpsertPayload(job, state);
    await this.writingDeskJobs.upsertActiveJob(userId, payload);
  }

  private async persistLetterResult(
    userId: string,
    fallback: ActiveWritingDeskJobResource,
    result: {
      status: WritingDeskLetterStatus;
      tone: WritingDeskLetterTone;
      responseId: string | null;
      content: string;
      references: string[];
      json: string;
    },
  ) {
    const latest = await this.writingDeskJobs.getActiveJobForUser(userId);
    const job = latest ?? fallback;
    const payload = this.buildLetterUpsertPayload(job, result);
    await this.writingDeskJobs.upsertActiveJob(userId, payload);
  }

  private buildLetterUpsertPayload(
    job: ActiveWritingDeskJobResource,
    result: {
      status: WritingDeskLetterStatus;
      tone: WritingDeskLetterTone;
      responseId?: string | null;
      content?: string | null;
      references?: string[] | null;
      json?: string | null;
    },
  ): UpsertActiveWritingDeskJobDto {
    const payload = this.buildBaseUpsertPayload(job);
    payload.letterStatus = result.status;
    payload.letterTone = result.tone;

    if (typeof result.responseId === 'string') {
      payload.letterResponseId = result.responseId;
    }

    if (typeof result.content === 'string') {
      payload.letterContent = result.content;
    }

    if (Array.isArray(result.references)) {
      payload.letterReferences = result.references;
    }

    if (typeof result.json === 'string') {
      payload.letterJson = result.json;
    }

    return payload;
  }

  private buildBaseUpsertPayload(job: ActiveWritingDeskJobResource): UpsertActiveWritingDeskJobDto {
    return {
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
      researchContent: this.normaliseResearchContent(job.researchContent ?? null) ?? undefined,
      researchResponseId: job.researchResponseId ?? undefined,
      letterTone: job.letterTone ?? undefined,
      letterResponseId: job.letterResponseId ?? undefined,
      letterContent: job.letterContent ?? undefined,
      letterJson: job.letterJson ?? undefined,
    };
  }

  private normaliseStreamEvent(event: ResponseStreamEvent): Record<string, unknown> {
    if (!event) {
      return { type: 'unknown', value: null };
    }

    if (typeof event === 'object') {
      try {
        return JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
      } catch {
        return { ...(event as unknown as Record<string, unknown>) };
      }
    }

    return { type: 'unknown', value: event };
  }

  async handleOrphanedRun(state: StreamingRunState) {
    try {
      const job = await this.writingDeskJobs.getActiveJobForUser(state.userId);
      if (!job || job.jobId !== state.jobId) {
        await this.streamingRuns.clearRun(state.type, state.runKey);
        return;
      }

      if (state.type === 'deep_research') {
        // Handled elsewhere
        return;
      }

      await this.persistLetterState(state.userId, job, { status: 'error', tone: job.letterTone ?? 'neutral' });
      if (this.isRunCharged(state)) {
        await this.refundCredits(state.userId, WritingDeskLetterService.LETTER_CREDIT_COST);
      }
    } catch (error) {
      this.logger.warn(
        `[streaming-state] Failed to recover letter run ${state.runKey}: ${(error as Error)?.message ?? error}`,
      );
    } finally {
      await this.streamingRuns.clearRun(state.type, state.runKey);
    }
  }

  private isRunCharged(state: StreamingRunState): boolean {
    if (!state.meta) {
      return false;
    }
    const charged = (state.meta as Record<string, unknown>).charged;
    return charged === true;
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

  private async* createStreamWithTimeout<T>(
    stream: AsyncIterable<T>,
    timeoutMs: number,
    onTimeout: () => void,
  ): AsyncGenerator<T, void, unknown> {
    let lastEventTime = Date.now();
    let timeoutTriggered = false;
    let timedOut = false;

    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - lastEventTime;
      if (elapsed >= timeoutMs && !timeoutTriggered) {
        timeoutTriggered = true;
        timedOut = true;
        clearInterval(checkInterval);
        onTimeout();
      }
    }, 1000);
    if (typeof (checkInterval as any)?.unref === 'function') {
      (checkInterval as any).unref();
    }

    try {
      for await (const event of stream) {
        lastEventTime = Date.now();

        if (timedOut) {
          break;
        }

        yield event;
      }
    } catch (error) {
      if (timeoutTriggered) {
        timedOut = true;
      }
      throw error;
    } finally {
      clearInterval(checkInterval);
    }
  }

  private async delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async refundCredits(userId: string, amount: number) {
    try {
      await this.userCredits.addToMine(userId, amount);
    } catch (error) {
      this.logger.warn(
        `Failed to refund ${amount} credits to user ${userId}: ${(error as Error)?.message ?? error}`,
      );
    }
  }
}

type ResponseStreamLike = AsyncIterable<ResponseStreamEvent> & {
  controller?: { abort: () => void };
};
