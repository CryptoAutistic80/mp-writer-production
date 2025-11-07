'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../lib/api-client';
import {
  MAX_WRITING_DESK_RESEARCH_ACTIVITY_ITEMS,
  describeResearchEvent,
  WritingDeskResearchStatus,
} from '../utils';

type DeepResearchStreamStatus =
  | 'starting'
  | 'charged'
  | 'queued'
  | 'in_progress'
  | 'background_polling'
  | 'completed'
  | 'error'
  | string;

type DeepResearchStreamMessage =
  | { type: 'status'; status: DeepResearchStreamStatus; remainingCredits?: number | null }
  | { type: 'delta'; text: string }
  | {
      type: 'complete';
      content: string;
      responseId: string | null;
      remainingCredits: number | null;
      usage?: Record<string, unknown> | null;
    }
  | { type: 'event'; event: { type?: string; [key: string]: any } }
  | { type: 'error'; message: string; remainingCredits?: number | null };

type DeepResearchHandshakeResponse = {
  jobId?: string | null;
  streamPath?: string | null;
};

export interface UseDeepResearchStreamOptions {
  jobId: string | null;
  onJobIdChange?: (jobId: string | null) => void;
  onCreditsChange?: (value: number | null | undefined) => void;
  reportRefundedFailure: (context: string) => Promise<number | null>;
  canAutoResume: boolean;
}

export interface ResearchSnapshotInput {
  researchContent?: string | null;
  researchResponseId?: string | null;
  researchStatus?: WritingDeskResearchStatus | null;
}

export interface DeepResearchStreamState {
  content: string;
  responseId: string | null;
  status: WritingDeskResearchStatus;
  activities: Array<{ id: string; text: string }>;
  error: string | null;
}

export interface UseDeepResearchStreamResult extends DeepResearchStreamState {
  start: (options?: { resume?: boolean }) => Promise<void>;
  reset: () => void;
  applySnapshot: (snapshot: ResearchSnapshotInput) => void;
}

export function useDeepResearchStream({
  jobId,
  onJobIdChange,
  onCreditsChange,
  reportRefundedFailure,
  canAutoResume,
}: UseDeepResearchStreamOptions): UseDeepResearchStreamResult {
  const [content, setContent] = useState<string>('');
  const [responseId, setResponseId] = useState<string | null>(null);
  const [status, setStatus] = useState<WritingDeskResearchStatus>('idle');
  const [activities, setActivities] = useState<Array<{ id: string; text: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [isBackgroundPolling, setIsBackgroundPolling] = useState(false);
  const [pendingAutoResume, setPendingAutoResume] = useState(false);

  const sourceRef = useRef<EventSource | null>(null);
  const lastEventRef = useRef<number>(0);
  const lastResumeAttemptRef = useRef<number>(0);
  const startInFlightRef = useRef(false);
  const resumeInFlightRef = useRef(false);

  const updateCreditsFromStream = useCallback(
    (value: number | null | undefined) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        const rounded = Math.round(value * 100) / 100;
        onCreditsChange?.(rounded);
      }
    },
    [onCreditsChange],
  );

  const closeStream = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setIsBackgroundPolling(false);
  }, []);

  const reset = useCallback(() => {
    closeStream();
    setContent('');
    setResponseId(null);
    setStatus('idle');
    setActivities([]);
    setError(null);
    setPendingAutoResume(false);
    setIsBackgroundPolling(false);
    lastEventRef.current = 0;
    lastResumeAttemptRef.current = 0;
    startInFlightRef.current = false;
    resumeInFlightRef.current = false;
  }, [closeStream]);

  const appendActivity = useCallback((text: string) => {
    setActivities((prev) => {
      const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text };
      const next = [entry, ...prev];
      return next.slice(0, MAX_WRITING_DESK_RESEARCH_ACTIVITY_ITEMS);
    });
  }, []);

  const start = useCallback(
    async (options?: { resume?: boolean }) => {
      const resume = options?.resume === true;
      if (resume) {
        if (sourceRef.current || resumeInFlightRef.current) return;
        resumeInFlightRef.current = true;
      } else {
        if (status === 'running' || startInFlightRef.current) return;
        startInFlightRef.current = true;
      }

      closeStream();
      setPendingAutoResume(false);
      setStatus('running');
      setError(null);
      setIsBackgroundPolling(false);
      if (!resume) {
        setContent('');
        setResponseId(null);
        setActivities([]);
      }

      let handshakeRejected = false;

      try {
        const payload: Record<string, unknown> = {};
        if (jobId) payload.jobId = jobId;
        if (resume) payload.resume = true;

        let handshake: DeepResearchHandshakeResponse | null = null;
        try {
          handshake = await apiClient.post<DeepResearchHandshakeResponse | null>(
            '/api/writing-desk/jobs/active/research/start',
            payload,
          );
        } catch (err) {
          handshakeRejected = true;
          const message = resume
            ? 'We could not resume deep research. Please try again.'
            : 'We could not start deep research. Please try again.';
          const error =
            err instanceof Error && typeof err.message === 'string' && err.message.trim().length > 0
              ? err
              : new Error(message);
          error.message = message;
          throw error;
        }

        const streamPath =
          handshake && typeof handshake.streamPath === 'string' && handshake.streamPath.trim().length > 0
            ? handshake.streamPath.trim()
            : '/api/ai/writing-desk/deep-research';
        const endpoint = new URL(streamPath, window.location.origin);
        const resolvedJobId =
          handshake && typeof handshake.jobId === 'string' && handshake.jobId.trim().length > 0
            ? handshake.jobId.trim()
            : jobId;
        if (resolvedJobId && !endpoint.searchParams.has('jobId')) {
          endpoint.searchParams.set('jobId', resolvedJobId);
        }

        if (resolvedJobId && resolvedJobId !== jobId) {
          onJobIdChange?.(resolvedJobId);
        }

        const source = new EventSource(endpoint.toString(), { withCredentials: true });
        sourceRef.current = source;

        const markActivity = () => {
          lastEventRef.current = Date.now();
        };

        source.onmessage = (event) => {
          let payload: DeepResearchStreamMessage | null = null;
          try {
            payload = JSON.parse(event.data) as DeepResearchStreamMessage;
          } catch {
            return;
          }
          if (!payload) return;

          markActivity();

          if (payload.type === 'status') {
            if (payload.status === 'background_polling') {
              setIsBackgroundPolling(true);
            }
            updateCreditsFromStream(payload.remainingCredits);
            const statusMessage: Record<string, string> = {
              starting: 'Preparing the research brief…',
              charged: 'Credits deducted. Research is starting…',
              queued: 'Deep research queued…',
              in_progress: 'Gathering evidence…',
              background_polling: 'Research continuing in the background…',
            };
            const descriptor =
              typeof payload.status === 'string' ? statusMessage[payload.status as keyof typeof statusMessage] : undefined;
            if (descriptor) appendActivity(descriptor);
            return;
          }

          if (payload.type === 'delta') {
            setIsBackgroundPolling(false);
            lastEventRef.current = Date.now();
            if (typeof payload.text === 'string') {
              setContent((prev) => {
                if (prev.length === 0) {
                  setActivities([]);
                }
                return prev + payload.text;
              });
            }
            return;
          }

          if (payload.type === 'event') {
            setIsBackgroundPolling(false);
            const descriptor = describeResearchEvent(payload.event);
            if (descriptor) appendActivity(descriptor);
            return;
          }

          if (payload.type === 'complete') {
            setIsBackgroundPolling(false);
            closeStream();
            setStatus('completed');
            setContent(payload.content ?? '');
            setResponseId(payload.responseId ?? null);
            updateCreditsFromStream(payload.remainingCredits);
            appendActivity('Deep research completed.');
            setPendingAutoResume(false);
            return;
          }

          if (payload.type === 'error') {
            setIsBackgroundPolling(false);
            closeStream();
            setStatus('error');
            setError(payload.message || 'Deep research failed. Please try again.');
            updateCreditsFromStream(payload.remainingCredits);
            appendActivity('Deep research encountered an error.');
            setPendingAutoResume(false);
            void reportRefundedFailure('deep research ran into a problem');
          }
        };

        source.onerror = () => {
          setIsBackgroundPolling(false);
          appendActivity('Connection lost during deep research. Attempting to resume…');
          closeStream();
          lastResumeAttemptRef.current = Date.now();
          setPendingAutoResume(true);
        };

        lastEventRef.current = Date.now();
      } catch (err) {
        setIsBackgroundPolling(false);
        closeStream();
        setStatus('error');
        const message =
          err instanceof Error && err.message ? err.message : 'We could not start deep research. Please try again.';
        setError(message);
        const activityText = resume
          ? handshakeRejected
            ? 'Unable to resume deep research.'
            : 'Deep research encountered an error.'
          : 'Unable to start deep research.';
        appendActivity(activityText);
        setPendingAutoResume(false);
        if (handshakeRejected) {
          const context = resume ? 'deep research could not resume' : 'deep research could not start';
          void reportRefundedFailure(context);
        }
      } finally {
        if (resume) {
          resumeInFlightRef.current = false;
        } else {
          startInFlightRef.current = false;
        }
      }
    },
    [
      appendActivity,
      closeStream,
      jobId,
      onJobIdChange,
      reportRefundedFailure,
      status,
      updateCreditsFromStream,
    ],
  );

  useEffect(() => {
    if (!pendingAutoResume) return;
    if (!canAutoResume) return;
    if (sourceRef.current) {
      setPendingAutoResume(false);
      return;
    }
    setPendingAutoResume(false);
    void start({ resume: true });
  }, [canAutoResume, pendingAutoResume, start]);

  useEffect(() => {
    if (status !== 'running') return undefined;

    const interval = window.setInterval(() => {
      const source = sourceRef.current;
      if (!source) return;

      if (isBackgroundPolling) {
        return;
      }

      const now = Date.now();
      const lastEventAt = lastEventRef.current || 0;
      if (now - lastEventAt < 45000) return;

      const lastAttemptAt = lastResumeAttemptRef.current || 0;
      if (now - lastAttemptAt < 15000) return;

      lastResumeAttemptRef.current = now;
      appendActivity('Connection quiet — attempting to resume the research stream…');
      closeStream();
      void start({ resume: true });
    }, 10000);

    return () => {
      window.clearInterval(interval);
    };
  }, [appendActivity, closeStream, isBackgroundPolling, start, status]);

  useEffect(() => () => closeStream(), [closeStream]);

  const applySnapshot = useCallback(
    (snapshot: ResearchSnapshotInput) => {
      const existingContent = snapshot.researchContent ?? '';
      setContent(existingContent);
      setResponseId(snapshot.researchResponseId ?? null);
      const nextStatus =
        snapshot.researchStatus ?? (existingContent.trim().length > 0 ? ('completed' as const) : ('idle' as const));
      const resolvedStatus = nextStatus === 'running' ? 'running' : nextStatus;
      setStatus(resolvedStatus);
      setPendingAutoResume(resolvedStatus === 'running');
      setIsBackgroundPolling(false);
      lastEventRef.current = 0;
      lastResumeAttemptRef.current = 0;
      setActivities([]);
      setError(null);
    },
    [],
  );

  return {
    content,
    responseId,
    status,
    activities,
    error,
    start,
    reset,
    applySnapshot,
  };
}
