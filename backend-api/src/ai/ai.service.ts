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
import { TranscriptionDto, StreamingTranscriptionDto } from './dto/transcription.dto';
import { Observable } from 'rxjs';
import { StreamingRunState } from '../streaming-state/streaming-state.types';
import { OpenAiClientService } from './openai/openai-client.service';
import { StreamingRunManager } from './streaming/streaming-run.manager';
import { WritingDeskLetterService } from './writing-desk/letter/letter.service';
import { WritingDeskResearchService } from './writing-desk/research/research.service';
import { WritingDeskFollowUpService } from './writing-desk/follow-up/follow-up.service';
import { AiTranscriptionService } from './transcription/transcription.service';
const STREAMING_RUN_ORPHAN_THRESHOLD_MS = 2 * 60 * 1000;
@Injectable()
export class AiService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(AiService.name);
  private readonly instanceId: string;
  private cleanupSweepInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly streamingRuns: StreamingRunManager,
    private readonly openAiClient: OpenAiClientService,
    private readonly letterService: WritingDeskLetterService,
    private readonly researchService: WritingDeskResearchService,
    private readonly followUpService: WritingDeskFollowUpService,
    private readonly transcriptionService: AiTranscriptionService,
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
    return this.followUpService.generate(userId, input);
  }

  async recordWritingDeskFollowUps(input: WritingDeskFollowUpDto) {
    return this.followUpService.record(input);
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
  async transcribeAudio(userId: string | null | undefined, input: TranscriptionDto) {
    if (!userId) {
      throw new BadRequestException('User account required');
    }
    return this.transcriptionService.transcribeAudio(userId, input);
  }

  streamTranscription(userId: string | null | undefined, input: StreamingTranscriptionDto): Observable<MessageEvent> {
    if (!userId) {
      throw new BadRequestException('User account required');
    }
    return this.transcriptionService.streamTranscription(userId, input);
  }
}
