'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { startLetterComposition } from '../api/letter';
import {
  MAX_WRITING_DESK_RESEARCH_ACTIVITY_ITEMS,
  createLetterRunId,
  describeResearchEvent,
  WritingDeskLetterPhase,
  composeLetterHtml,
} from '../utils';
import {
  WritingDeskLetterPayload,
  WritingDeskLetterStatus,
  WritingDeskLetterTone,
} from '../types';

type LetterStreamMessage =
  | { type: 'status'; status: string; remainingCredits?: number | null }
  | { type: 'event'; event: { type?: string; [key: string]: any } }
  | { type: 'delta'; text: string }
  | { type: 'letter_delta'; html: string }
  | { type: 'complete'; letter: WritingDeskLetterPayload; remainingCredits: number | null }
  | { type: 'error'; message: string; remainingCredits?: number | null };

export interface UseLetterComposerOptions {
  jobId: string | null;
  onJobIdChange?: (jobId: string | null) => void;
  onCreditsChange?: (value: number | null | undefined) => void;
  reportRefundedFailure: (context: string) => Promise<number | null>;
  clearToast: () => void;
  canAutoResume: boolean;
}

export interface LetterSnapshotInput {
  letterStatus?: WritingDeskLetterStatus | null;
  letterTone?: WritingDeskLetterTone | null;
  letterResponseId?: string | null;
  letterContent?: string | null;
  letterReferences?: string[] | null;
  letterJson?: string | null;
}

export interface UseLetterComposerResult {
  status: WritingDeskLetterStatus;
  phase: WritingDeskLetterPhase;
  selectedTone: WritingDeskLetterTone | null;
  contentHtml: string;
  references: string[];
  responseId: string | null;
  rawJson: string | null;
  error: string | null;
  events: Array<{ id: string; text: string }>;
  statusMessage: string | null;
  remainingCredits: number | null;
  reasoningVisible: boolean;
  metadata: WritingDeskLetterPayload | null;
  isSaving: boolean;
  saveError: string | null;
  savedResponseId: string | null;
  reset: () => void;
  begin: (tone: WritingDeskLetterTone) => Promise<void>;
  resume: () => Promise<void>;
  applySnapshot: (snapshot: LetterSnapshotInput) => void;
  enterToneSelection: () => void;
  setPhase: (value: WritingDeskLetterPhase) => void;
  setStatusMessage: (value: string | null) => void;
  setError: (value: string | null) => void;
  setIsSaving: (value: boolean) => void;
  setSaveError: (value: string | null) => void;
  setSavedResponseId: (value: string | null) => void;
  setMetadata: (value: WritingDeskLetterPayload | null) => void;
  setReasoningVisible: (value: boolean) => void;
}

export function useLetterComposer({
  jobId,
  onJobIdChange,
  onCreditsChange,
  reportRefundedFailure,
  clearToast,
  canAutoResume,
}: UseLetterComposerOptions): UseLetterComposerResult {
  const [status, setStatus] = useState<WritingDeskLetterStatus>('idle');
  const [phase, setPhase] = useState<WritingDeskLetterPhase>('idle');
  const [selectedTone, setSelectedTone] = useState<WritingDeskLetterTone | null>(null);
  const [contentHtml, setContentHtml] = useState<string>('');
  const [references, setReferences] = useState<string[]>([]);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [rawJson, setRawJson] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<Array<{ id: string; text: string }>>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [remainingCredits, setRemainingCredits] = useState<number | null>(null);
  const [reasoningVisible, setReasoningVisible] = useState(true);
  const [metadata, setMetadata] = useState<WritingDeskLetterPayload | null>(null);
  const [pendingAutoResume, setPendingAutoResume] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedResponseId, setSavedResponseId] = useState<string | null>(null);

  const sourceRef = useRef<EventSource | null>(null);
  const jsonBufferRef = useRef<string>('');
  const lastEventRef = useRef<number>(0);
  const lastResumeAttemptRef = useRef<number>(0);

  const updateCredits = useCallback(
    (value: number | null | undefined) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        const rounded = Math.round(value * 100) / 100;
        setRemainingCredits(rounded);
        onCreditsChange?.(rounded);
      }
    },
    [onCreditsChange],
  );

  const appendEvent = useCallback((text: string) => {
    setEvents((prev) => {
      const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text };
      const next = [entry, ...prev];
      return next.slice(0, MAX_WRITING_DESK_RESEARCH_ACTIVITY_ITEMS);
    });
  }, []);

  const closeStream = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    closeStream();
    setStatus('idle');
    setPhase('idle');
    setSelectedTone(null);
    setContentHtml('');
    setReferences([]);
    setResponseId(null);
    setRawJson(null);
    setError(null);
    setEvents([]);
    setStatusMessage(null);
    setRemainingCredits(null);
    setReasoningVisible(true);
    setMetadata(null);
    setSaveError(null);
    setSavedResponseId(null);
    setIsSaving(false);
    clearToast();
    jsonBufferRef.current = '';
    setPendingAutoResume(false);
  }, [clearToast, closeStream]);

  const enterToneSelection = useCallback(() => {
    if (status !== 'idle') {
      reset();
    }
    setPhase('tone');
    setStatusMessage(null);
    setError(null);
  }, [reset, status]);

  const openStream = useCallback(
    (streamPath: string) => {
      closeStream();
      setStatus('generating');
      setPhase('streaming');
      setStatusMessage('Composing your letter…');
      setError(null);
      setContentHtml('');
      setReferences([]);
      setResponseId(null);
      setRawJson(null);
      setRemainingCredits(null);
      setReasoningVisible(true);
      setMetadata(null);
      setSaveError(null);
      setIsSaving(false);
      clearToast();
      jsonBufferRef.current = '';
      setPendingAutoResume(false);
      let resolvedPath = streamPath;
      if (typeof window !== 'undefined') {
        try {
          const url = new URL(streamPath, window.location.origin);
          url.searchParams.set('runId', createLetterRunId());
          resolvedPath = url.toString();
        } catch {
          // ignore malformed paths and fall back to provided value
        }
      }
      const source = new EventSource(resolvedPath, { withCredentials: true });
      sourceRef.current = source;

      const markActivity = () => {
        lastEventRef.current = Date.now();
      };

      source.onmessage = (event) => {
        markActivity();
        let payload: LetterStreamMessage | null = null;
        try {
          payload = JSON.parse(event.data) as LetterStreamMessage;
        } catch {
          return;
        }
        if (!payload) return;

        if (payload.type === 'status') {
          setStatusMessage(payload.status);
          updateCredits(payload.remainingCredits);
          return;
        }

        if (payload.type === 'event') {
          const summary = describeResearchEvent(payload.event);
          if (summary) {
            appendEvent(summary);
          }
          return;
        }

        if (payload.type === 'delta') {
          if (typeof payload.text === 'string') {
            jsonBufferRef.current += payload.text;
            setRawJson(jsonBufferRef.current);
          }
          return;
        }

        if (payload.type === 'letter_delta') {
          if (typeof payload.html === 'string') {
            setContentHtml(payload.html);
            setEvents([]);
          }
          return;
        }

        if (payload.type === 'complete') {
          updateCredits(payload.remainingCredits);
          setReasoningVisible(false);
          setStatus('completed');
          setPhase('completed');
          setStatusMessage('Letter ready');
          setIsSaving(false);
          setSaveError(null);
          clearToast();
          if (
            savedResponseId &&
            payload.letter.responseId &&
            payload.letter.responseId !== savedResponseId
          ) {
            setSavedResponseId(null);
          }
          setContentHtml(payload.letter.letterContent ?? '');
          setReferences(payload.letter.references ?? []);
          setResponseId(payload.letter.responseId ?? null);
          setRawJson(payload.letter.rawJson ?? null);
          setSelectedTone(payload.letter.tone ?? null);
          setMetadata(payload.letter);
          jsonBufferRef.current = payload.letter.rawJson ?? '';
          setError(null);
          closeStream();
          return;
        }

        if (payload.type === 'error') {
          updateCredits(payload.remainingCredits);
          setStatus('error');
          setPhase('error');
          setError(payload.message);
          setStatusMessage(null);
          setMetadata(null);
          setIsSaving(false);
          setSaveError(null);
          clearToast();
          closeStream();
          void reportRefundedFailure('letter composition ran into a problem').then((latest) => {
            if (typeof latest === 'number') {
              setRemainingCredits(latest);
            }
          });
        }
      };

      source.onerror = () => {
        closeStream();
        setStatus('error');
        setPhase('error');
        setError('The letter stream disconnected. Please try again.');
        setStatusMessage(null);
        setIsSaving(false);
        setSaveError(null);
        clearToast();
        void reportRefundedFailure('letter composition connection dropped').then((latest) => {
          if (typeof latest === 'number') {
            setRemainingCredits(latest);
          }
        });
      };

      lastEventRef.current = Date.now();
    },
    [appendEvent, clearToast, closeStream, reportRefundedFailure, savedResponseId, updateCredits],
  );

  const begin = useCallback(
    async (tone: WritingDeskLetterTone) => {
      setStatus('generating');
      setPhase('streaming');
      setStatusMessage('Preparing your letter request…');
      setError(null);
      setSelectedTone(tone);
      setEvents([]);
      setRemainingCredits(null);
      setReasoningVisible(true);
      jsonBufferRef.current = '';
      setSavedResponseId(null);
      setSaveError(null);
      setIsSaving(false);
      clearToast();

      try {
        const handshake = await startLetterComposition({ jobId: jobId ?? undefined, tone });
        if (handshake?.jobId) {
          onJobIdChange?.(handshake.jobId);
        }
        const url = new URL(handshake.streamPath, window.location.origin);
        if (!url.searchParams.has('jobId') && (jobId ?? handshake?.jobId)) {
          url.searchParams.set('jobId', (jobId ?? handshake.jobId) as string);
        }
        openStream(url.toString());
      } catch (err: any) {
        setStatus('error');
        setPhase('error');
        setError(err?.message || 'We could not start letter composition. Please try again.');
        setStatusMessage(null);
        void reportRefundedFailure('letter composition could not start').then((latest) => {
          if (typeof latest === 'number') {
            setRemainingCredits(latest);
          }
        });
      }
    },
    [clearToast, jobId, onJobIdChange, openStream, reportRefundedFailure],
  );

  const resume = useCallback(async () => {
    setPendingAutoResume(false);
    if (!selectedTone) {
      setStatus('error');
      setPhase('error');
      setError('We could not resume letter composition. Start again when ready.');
      setStatusMessage(null);
      return;
    }

    setStatus('generating');
    setPhase('streaming');
    setStatusMessage('Reconnecting to your letter…');
    setError(null);
    setEvents([]);
    setRemainingCredits(null);
    setReasoningVisible(true);
    jsonBufferRef.current = '';
    setSaveError(null);
    setIsSaving(false);
    clearToast();

    try {
      const handshake = await startLetterComposition({
        jobId: jobId ?? undefined,
        tone: selectedTone,
        resume: true,
      });
      if (handshake?.jobId) {
        onJobIdChange?.(handshake.jobId);
      }
      const url = new URL(handshake.streamPath, window.location.origin);
      if (!url.searchParams.has('jobId') && (jobId ?? handshake.jobId)) {
        url.searchParams.set('jobId', (jobId ?? handshake.jobId) as string);
      }
      openStream(url.toString());
    } catch (err: any) {
      setStatus('error');
      setPhase('error');
      const message =
        err?.message && typeof err.message === 'string'
          ? err.message
          : 'We could not resume letter composition. Start again when ready.';
      setError(message);
      setStatusMessage(null);
      void reportRefundedFailure('letter composition could not resume').then((latest) => {
        if (typeof latest === 'number') {
          setRemainingCredits(latest);
        }
      });
    }
  }, [clearToast, jobId, onJobIdChange, openStream, reportRefundedFailure, selectedTone]);

  useEffect(() => {
    if (!pendingAutoResume) return;
    if (!canAutoResume) return;
    if (sourceRef.current) {
      setPendingAutoResume(false);
      return;
    }
    void resume();
  }, [canAutoResume, pendingAutoResume, resume]);

  useEffect(() => {
    if (status !== 'generating') return undefined;

    const interval = window.setInterval(() => {
      const source = sourceRef.current;
      if (!source) return;

      const now = Date.now();
      const lastEventAt = lastEventRef.current || 0;
      if (now - lastEventAt < 45000) return;

      const lastAttemptAt = lastResumeAttemptRef.current || 0;
      if (now - lastAttemptAt < 15000) return;

      lastResumeAttemptRef.current = now;
      appendEvent('Connection quiet — attempting to resume letter composition…');
      closeStream();
      void resume();
    }, 10000);

    return () => {
      window.clearInterval(interval);
    };
  }, [appendEvent, closeStream, resume, status]);

  useEffect(() => () => closeStream(), [closeStream]);

  const applySnapshot = useCallback(
    (snapshot: LetterSnapshotInput) => {
      closeStream();
      setSavedResponseId(null);
      setSaveError(null);
      setIsSaving(false);
      clearToast();
      setSelectedTone(snapshot.letterTone ?? null);
      const nextStatus = snapshot.letterStatus ?? 'idle';
      setStatus(nextStatus);
      setPhase(nextStatus === 'generating' ? 'streaming' : nextStatus === 'completed' ? 'completed' : 'idle');
      setReferences(Array.isArray(snapshot.letterReferences) ? [...snapshot.letterReferences] : []);
      setResponseId(snapshot.letterResponseId ?? null);
      setRawJson(snapshot.letterJson ?? null);
      jsonBufferRef.current = '';
      let resumeLetterHtml: string | null = null;
      if (snapshot.letterJson) {
        try {
          const parsed = JSON.parse(snapshot.letterJson) as Record<string, any>;
          const parsedReferences = Array.isArray(parsed.references) ? parsed.references : [];
          resumeLetterHtml = composeLetterHtml({
            mpName: parsed.mp_name ?? '',
            mpAddress1: parsed.mp_address_1 ?? '',
            mpAddress2: parsed.mp_address_2 ?? '',
            mpCity: parsed.mp_city ?? '',
            mpCounty: parsed.mp_county ?? '',
            mpPostcode: parsed.mp_postcode ?? '',
            date: parsed.date ?? '',
            subjectLineHtml: parsed.subject_line_html ?? '',
            letterContentHtml: parsed.letter_content ?? '',
            senderName: parsed.sender_name ?? '',
            senderAddress1: parsed.sender_address_1 ?? '',
            senderAddress2: parsed.sender_address_2 ?? '',
            senderAddress3: parsed.sender_address_3 ?? '',
            senderCity: parsed.sender_city ?? '',
            senderCounty: parsed.sender_county ?? '',
            senderPostcode: parsed.sender_postcode ?? '',
            senderTelephone: parsed.sender_phone ?? '',
            references: parsedReferences,
          });
          setMetadata({
            mpName: parsed.mp_name ?? '',
            mpAddress1: parsed.mp_address_1 ?? '',
            mpAddress2: parsed.mp_address_2 ?? '',
            mpCity: parsed.mp_city ?? '',
            mpCounty: parsed.mp_county ?? '',
            mpPostcode: parsed.mp_postcode ?? '',
            date: parsed.date ?? '',
            letterContent: resumeLetterHtml ?? parsed.letter_content ?? '',
            senderName: parsed.sender_name ?? '',
            senderAddress1: parsed.sender_address_1 ?? '',
            senderAddress2: parsed.sender_address_2 ?? '',
            senderAddress3: parsed.sender_address_3 ?? '',
            senderCity: parsed.sender_city ?? '',
            senderCounty: parsed.sender_county ?? '',
            senderPostcode: parsed.sender_postcode ?? '',
            senderTelephone: parsed.sender_phone ?? '',
            references: parsedReferences,
            responseId: snapshot.letterResponseId ?? null,
            tone: snapshot.letterTone ?? null,
            rawJson: snapshot.letterJson ?? '',
            subjectLineHtml: parsed.subject_line_html ?? '',
          });
        } catch {
          setMetadata(null);
        }
      } else {
        setMetadata(null);
      }
      const resolvedLetterContent =
        typeof snapshot.letterContent === 'string' && snapshot.letterContent.trim().length > 0
          ? snapshot.letterContent
          : resumeLetterHtml ?? '';
      setEvents([]);
      setReasoningVisible(nextStatus !== 'completed');

      if (nextStatus === 'completed') {
        setContentHtml(resolvedLetterContent);
        setPhase('completed');
        setError(null);
        setStatusMessage(null);
        setRemainingCredits(null);
        setReasoningVisible(false);
      } else if (nextStatus === 'generating') {
        setContentHtml(resumeLetterHtml ?? '');
        setPhase('streaming');
        setError(null);
        setStatusMessage('Composing your letter…');
        setRemainingCredits(null);
        setReasoningVisible(true);
        setMetadata(null);
        setEvents([]);
        setPendingAutoResume(true);
      } else if (nextStatus === 'error') {
        setContentHtml(resolvedLetterContent);
        setPhase('error');
        setError('Letter drafting did not finish. Start again when ready.');
        setReasoningVisible(true);
        setMetadata(null);
        setStatusMessage(null);
      } else {
        setContentHtml(resolvedLetterContent);
        setPhase('idle');
        setError(null);
        setStatusMessage(null);
        setReasoningVisible(true);
        if (!snapshot.letterJson) {
          setMetadata(null);
        }
      }
    },
    [clearToast, closeStream],
  );

  return {
    status,
    phase,
    selectedTone,
    contentHtml,
    references,
    responseId,
    rawJson,
    error,
    events,
    statusMessage,
    remainingCredits,
    reasoningVisible,
    metadata,
    isSaving,
    saveError,
    savedResponseId,
    reset,
    begin,
    resume,
    applySnapshot,
    enterToneSelection,
    setPhase,
    setStatusMessage,
    setError,
    setIsSaving,
    setSaveError,
    setSavedResponseId,
    setMetadata,
    setReasoningVisible,
  };
}
