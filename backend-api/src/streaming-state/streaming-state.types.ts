export type StreamingRunKind = 'deep_research' | 'letter';

export type StreamingRunStatus = 'running' | 'completed' | 'error';

export interface StreamingRunMetadata {
  [key: string]: unknown;
}

export interface StreamingRunState {
  type: StreamingRunKind;
  runKey: string;
  userId: string;
  jobId: string;
  status: StreamingRunStatus;
  startedAt: number;
  lastActivityAt: number;
  responseId: string | null;
  instanceId: string;
  meta?: StreamingRunMetadata;
}

export interface StreamingRunPatch {
  status?: StreamingRunStatus;
  responseId?: string | null;
  meta?: StreamingRunMetadata;
}
