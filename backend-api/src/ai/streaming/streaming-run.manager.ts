import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { StreamingStateService } from '../../streaming-state/streaming-state.service';
import {
  StreamingRunKind,
  StreamingRunPatch,
  StreamingRunState,
} from '../../streaming-state/streaming-state.types';

@Injectable()
export class StreamingRunManager {
  private readonly logger = new Logger(StreamingRunManager.name);

  constructor(private readonly streamingState: StreamingStateService) {}

  getInstanceId(): string {
    return this.streamingState.getInstanceId();
  }

  async listAllRuns(): Promise<StreamingRunState[]> {
    return this.streamingState.listAllRuns();
  }

  async findStaleRuns(thresholdMs: number): Promise<StreamingRunState[]> {
    return this.streamingState.findStaleRuns(thresholdMs);
  }

  async getRun(type: StreamingRunKind, runKey: string): Promise<StreamingRunState | null> {
    return this.streamingState.getRun(type, runKey);
  }

  async registerRun(params: {
    type: StreamingRunKind;
    runKey: string;
    userId: string;
    jobId: string;
    status?: StreamingRunState['status'];
    responseId?: string | null;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.streamingState.registerRun(params);
    } catch (error) {
      this.logger.error(
        `[streaming-state] Failed to register ${params.type} run ${params.runKey}: ${(error as Error)?.message ?? error}`,
      );
      throw new ServiceUnavailableException('Streaming is temporarily unavailable. Please try again in a moment.');
    }
  }

  async touchRun(type: StreamingRunKind, runKey: string, patch?: StreamingRunPatch): Promise<void> {
    try {
      await this.streamingState.touchRun(type, runKey, patch);
    } catch (error) {
      this.logger.warn(
        `[streaming-state] Failed to update ${type} run ${runKey}: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  async clearRun(type: StreamingRunKind, runKey: string): Promise<void> {
    try {
      await this.streamingState.removeRun(type, runKey);
    } catch (error) {
      this.logger.warn(
        `[streaming-state] Failed to remove ${type} run ${runKey}: ${(error as Error)?.message ?? error}`,
      );
    }
  }

  createHeartbeat(type: StreamingRunKind, runKey: string) {
    let lastBeatAt = 0;
    return (patch?: StreamingRunPatch) => {
      const now = Date.now();
      if (!patch && now - lastBeatAt < 1000) {
        return;
      }
      lastBeatAt = now;
      void this.touchRun(type, runKey, patch);
    };
  }

  async updateRun(type: StreamingRunKind, runKey: string, patch?: StreamingRunPatch): Promise<StreamingRunState | null> {
    return this.streamingState.updateRun(type, runKey, patch);
  }
}

