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
import { Observable } from 'rxjs';
import { StreamingRunState, StreamingRunKind } from '../streaming-state/streaming-state.types';
import { OpenAiClientService } from './openai/openai-client.service';
import { StreamingRunManager } from './streaming/streaming-run.manager';
import { WritingDeskLetterService } from './writing-desk/letter/letter.service';
import { WritingDeskResearchService } from './writing-desk/research/research.service';
import { extractFirstText, isOpenAiRelatedError } from './openai/openai.helpers';

const FOLLOW_UP_CREDIT_COST = 0.1;
const TRANSCRIPTION_CREDIT_COST = 0;
const STREAMING_RUN_ORPHAN_THRESHOLD_MS = 2 * 60 * 1000;
@Injectable()
export class AiService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AiService.name);
  private readonly instanceId: string;
  private cleanupSweepInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly userCredits: UserCreditsService,
    private readonly writingDeskJobs: WritingDeskJobsService,
    private readonly streamingRuns: StreamingRunManager,
    private readonly openAiClient: OpenAiClientService,
    private readonly letterService: WritingDeskLetterService,
    private readonly researchService: WritingDeskResearchService,
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
            const cancelled = await this.researchService.markRunCancelled(runKey);
            if (!cancelled) {
              await this.streamingRuns.updateRun(run.type, runKey, { status: 'cancelled' });
              this.logger.log(`Marked orphaned ${run.type} run as cancelled: ${runKey}`);
          } else {
              this.logger.log(`Cancelled ${run.type} run: ${runKey}`);
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
    const RESEARCH_STALE_THRESHOLD_MS = this.researchService.getRunTtlMs() + 40 * 60 * 1000;

    this.cleanupSweepInterval = setInterval(() => {
      const now = Date.now();
      const cleanedLetter = this.letterService.cleanupStaleRuns(now, LETTER_STALE_THRESHOLD_MS);
      const cleanedResearch = this.researchService.cleanupStaleRuns(now, RESEARCH_STALE_THRESHOLD_MS);

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
    options?: { jobId?: string | null; restart?: boolean; createIfMissing?: boolean },
  ): Observable<MessageEvent> {
    if (!userId) {
      throw new BadRequestException('User account required');
    }
    return this.researchService.streamResearch(userId, {
      jobId: options?.jobId ?? null,
      restart: options?.restart,
      createIfMissing: options?.createIfMissing,
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
  ): Promise<{ jobId: string; status: 'running' | 'completed' | 'error' }> {
    return this.researchService.ensureResearchRun(userId, requestedJobId, options);
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
      if (state.type === 'deep_research') {
        await this.researchService.handleOrphanedRun(state);
        return;
      }
    } catch (error) {
      this.logger.warn(
        `[streaming-state] Failed to recover run ${state.type}:${state.runKey}: ${(error as Error)?.message ?? error}`,
      );
    } finally {
      if (state.type !== 'letter' && state.type !== 'deep_research') {
        await this.streamingRuns.clearRun(state.type, state.runKey);
      }
    }
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
