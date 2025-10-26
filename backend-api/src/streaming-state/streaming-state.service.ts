import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheckError, HealthIndicatorResult } from '@nestjs/terminus';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import {
  StreamingRunKind,
  StreamingRunPatch,
  StreamingRunState,
  StreamingRunStatus,
} from './streaming-state.types';

const STREAMING_STATE_KEY_PREFIX = 'mpw:streaming';
const DEFAULT_STREAMING_STATE_TTL_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class StreamingStateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StreamingStateService.name);
  private readonly redis: Redis;
  private readonly instanceId = randomUUID();
  private readonly ttlMs: number;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL');
    if (!url) {
      throw new Error('REDIS_URL environment variable is not defined.');
    }

    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });

    this.redis.on('error', (error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });

    const ttlMs = Number(this.config.get<string>('STREAMING_STATE_TTL_MS'));
    this.ttlMs = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : DEFAULT_STREAMING_STATE_TTL_MS;
  }

  async onModuleInit() {
    try {
      await this.redis.connect();
      this.logger.log(`Streaming state Redis connection ready (instance ${this.instanceId})`);
    } catch (error) {
      this.logger.error(`Failed to connect to Redis: ${(error as Error)?.message ?? error}`);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.redis.quit();
    } catch (error) {
      this.logger.warn(`Failed to close Redis connection: ${(error as Error)?.message ?? error}`);
    }
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  async registerRun(params: {
    type: StreamingRunKind;
    runKey: string;
    userId: string;
    jobId: string;
    status?: StreamingRunStatus;
    responseId?: string | null;
    meta?: Record<string, unknown>;
  }): Promise<StreamingRunState> {
    const now = Date.now();
    const state: StreamingRunState = {
      type: params.type,
      runKey: params.runKey,
      userId: params.userId,
      jobId: params.jobId,
      status: params.status ?? 'running',
      startedAt: now,
      lastActivityAt: now,
      responseId: params.responseId ?? null,
      instanceId: this.instanceId,
      meta: params.meta,
    };

    await this.saveState(state);
    return state;
  }

  async touchRun(type: StreamingRunKind, runKey: string, patch?: StreamingRunPatch): Promise<void> {
    await this.updateRun(type, runKey, patch);
  }

  async updateRun(type: StreamingRunKind, runKey: string, patch?: StreamingRunPatch): Promise<StreamingRunState | null> {
    const existing = await this.getRun(type, runKey);
    if (!existing) {
      return null;
    }

    const now = Date.now();
    const next: StreamingRunState = {
      ...existing,
      status: patch?.status ?? existing.status,
      responseId: patch?.responseId !== undefined ? patch.responseId : existing.responseId,
      meta: patch?.meta ? { ...(existing.meta ?? {}), ...patch.meta } : existing.meta,
      lastActivityAt: now,
      instanceId: this.instanceId,
    };

    await this.saveState(next);
    return next;
  }

  async removeRun(type: StreamingRunKind, runKey: string): Promise<void> {
    try {
      await this.redis.del(this.buildKey(type, runKey));
    } catch (error) {
      this.logger.warn(
        `Failed to remove streaming run ${type}:${runKey} from Redis: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  async getRun(type: StreamingRunKind, runKey: string): Promise<StreamingRunState | null> {
    try {
      const raw = await this.redis.get(this.buildKey(type, runKey));
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as StreamingRunState;
    } catch (error) {
      this.logger.warn(
        `Failed to read streaming run ${type}:${runKey} from Redis: ${(error as Error)?.message ?? error}`,
      );
      return null;
    }
  }

  async findStaleRuns(maxAgeMs: number): Promise<StreamingRunState[]> {
    const states = await this.listAllRuns();
    const threshold = Date.now() - maxAgeMs;
    return states.filter((state) => state.lastActivityAt <= threshold && state.status === 'running');
  }

  async checkHealth(): Promise<HealthIndicatorResult> {
    try {
      const [pong, oldest] = await Promise.all([this.redis.ping(), this.getOldestRunAge()]);
      if (pong !== 'PONG') {
        throw new Error(`Unexpected Redis PING response: ${pong}`);
      }
      return {
        streamingState: {
          status: 'up',
          instanceId: this.instanceId,
          oldestRunAgeMs: oldest,
        },
      };
    } catch (error) {
      throw new HealthCheckError('streamingState', error as Error);
    }
  }

  private async getOldestRunAge(): Promise<number> {
    const runs = await this.listAllRuns();
    if (runs.length === 0) {
      return 0;
    }
    const oldest = runs.reduce((min, run) => Math.min(min, run.startedAt), Number.POSITIVE_INFINITY);
    return Date.now() - oldest;
  }

  async listAllRuns(): Promise<StreamingRunState[]> {
    const results: StreamingRunState[] = [];
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', `${STREAMING_STATE_KEY_PREFIX}:*`, 'COUNT', 50);
      cursor = nextCursor;
      if (keys.length === 0) continue;
      const values = await this.redis.mget(...keys);
      for (const raw of values) {
        if (!raw) continue;
        try {
          results.push(JSON.parse(raw) as StreamingRunState);
        } catch (error) {
          this.logger.warn(`Failed to parse streaming state payload: ${(error as Error)?.message ?? error}`);
        }
      }
    } while (cursor !== '0');
    return results;
  }

  private async saveState(state: StreamingRunState): Promise<void> {
    try {
      await this.redis.set(
        this.buildKey(state.type, state.runKey),
        JSON.stringify(state),
        'PX',
        this.ttlMs,
      );
    } catch (error) {
      this.logger.error(
        `Failed to persist streaming run ${state.type}:${state.runKey}: ${(error as Error)?.message ?? error}`,
      );
      throw error;
    }
  }

  private buildKey(type: StreamingRunKind, runKey: string): string {
    return `${STREAMING_STATE_KEY_PREFIX}:${type}:${runKey}`;
  }
}
