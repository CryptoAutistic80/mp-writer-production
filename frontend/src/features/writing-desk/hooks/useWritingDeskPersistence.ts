'use client';

import { useCallback, useEffect, useRef } from 'react';
import { ActiveWritingDeskJob, UpsertActiveWritingDeskJobPayload } from '../types';
import { useActiveWritingDeskJob } from './useActiveWritingDeskJob';

const signatureForPayload = (payload: UpsertActiveWritingDeskJobPayload, resolvedJobId?: string | null) =>
  JSON.stringify({
    ...payload,
    jobId: resolvedJobId ?? payload.jobId ?? null,
  });

export interface UseWritingDeskPersistenceOptions {
  jobId: string | null;
  setJobId: (value: string | null) => void;
  hasHandledInitialJob: boolean;
  setHasHandledInitialJob: (value: boolean) => void;
  pendingJob: ActiveWritingDeskJob | null;
  setPendingJob: (job: ActiveWritingDeskJob | null) => void;
  setResumeModalOpen: (value: boolean) => void;
  persistenceEnabled: boolean;
  setPersistenceEnabled: (value: boolean) => void;
  setJobSaveError: (value: string | null) => void;
  getSnapshot: () => UpsertActiveWritingDeskJobPayload;
  serializeJob: (job: ActiveWritingDeskJob) => UpsertActiveWritingDeskJobPayload;
  onApplySnapshot: (job: ActiveWritingDeskJob) => void;
  onResetLocalState: () => void;
}

export interface UseWritingDeskPersistenceResult {
  activeJob: ActiveWritingDeskJob | null;
  isActiveJobLoading: boolean;
  saveJob: ReturnType<typeof useActiveWritingDeskJob>['saveJob'];
  isSavingJob: boolean;
  clearJob: ReturnType<typeof useActiveWritingDeskJob>['clearJob'];
  isClearingJob: boolean;
  activeJobError: Error | null;
  handleResumeExistingJob: () => void;
  handleDiscardExistingJob: () => Promise<void>;
  markSnapshotSaved: (payload: UpsertActiveWritingDeskJobPayload, resolvedJobId: string | null) => void;
}

export function useWritingDeskPersistence({
  jobId,
  setJobId,
  hasHandledInitialJob,
  setHasHandledInitialJob,
  pendingJob,
  setPendingJob,
  setResumeModalOpen,
  persistenceEnabled,
  setPersistenceEnabled,
  setJobSaveError,
  getSnapshot,
  serializeJob,
  onApplySnapshot,
  onResetLocalState,
}: UseWritingDeskPersistenceOptions): UseWritingDeskPersistenceResult {
  const {
    activeJob,
    isLoading: isActiveJobLoading,
    saveJob,
    isSaving: isSavingJob,
    clearJob,
    isClearing: isClearingJob,
    error: activeJobError,
  } = useActiveWritingDeskJob();

  const lastPersistedRef = useRef<string | null>(null);

  useEffect(() => {
    if (hasHandledInitialJob || isActiveJobLoading) return;
    if (activeJob) {
      setPendingJob(activeJob);
      setResumeModalOpen(true);
    } else {
      onResetLocalState();
      setHasHandledInitialJob(true);
      setJobId(null);
      lastPersistedRef.current = null;
    }
  }, [
    activeJob,
    hasHandledInitialJob,
    isActiveJobLoading,
    onResetLocalState,
    setHasHandledInitialJob,
    setJobId,
    setPendingJob,
    setResumeModalOpen,
  ]);

  useEffect(() => {
    if (!activeJobError) return;
    setJobSaveError('We could not load your saved letter. You can start a new one.');
    onResetLocalState();
    setHasHandledInitialJob(true);
    setJobId(null);
    lastPersistedRef.current = null;
    setPendingJob(null);
    setResumeModalOpen(false);
  }, [
    activeJobError,
    onResetLocalState,
    setHasHandledInitialJob,
    setJobId,
    setJobSaveError,
    setPendingJob,
    setResumeModalOpen,
  ]);

  const handleResumeExistingJob = useCallback(() => {
    if (!pendingJob) return;
    onApplySnapshot(pendingJob);
    setJobId(pendingJob.jobId);
    const payload = serializeJob(pendingJob);
    lastPersistedRef.current = signatureForPayload(payload, pendingJob.jobId);
    setResumeModalOpen(false);
    setPendingJob(null);
    setHasHandledInitialJob(true);
    setPersistenceEnabled(true);
    setJobSaveError(null);
  }, [
    onApplySnapshot,
    pendingJob,
    serializeJob,
    setHasHandledInitialJob,
    setJobId,
    setJobSaveError,
    setPendingJob,
    setPersistenceEnabled,
    setResumeModalOpen,
  ]);

  const handleDiscardExistingJob = useCallback(async () => {
    setJobSaveError(null);
    setPersistenceEnabled(false);
    lastPersistedRef.current = null;
    setJobId(null);
    try {
      await clearJob();
      onResetLocalState();
      setPendingJob(null);
      setResumeModalOpen(false);
      setHasHandledInitialJob(true);
    } catch {
      setJobSaveError('We could not clear your saved letter. Please try again.');
    }
  }, [
    clearJob,
    onResetLocalState,
    setHasHandledInitialJob,
    setJobId,
    setJobSaveError,
    setPendingJob,
    setPersistenceEnabled,
    setResumeModalOpen,
  ]);

  const markSnapshotSaved = useCallback(
    (payload: UpsertActiveWritingDeskJobPayload, resolvedJobId: string | null) => {
      lastPersistedRef.current = signatureForPayload(payload, resolvedJobId);
    },
    [],
  );

  useEffect(() => {
    if (!persistenceEnabled) return;
    if (isSavingJob) return;

    const timeout = window.setTimeout(() => {
      const payload = getSnapshot();
      const signature = signatureForPayload(payload, payload.jobId ?? jobId);
      if (lastPersistedRef.current === signature) return;

      saveJob(payload)
        .then((job) => {
          setJobId(job.jobId);
          lastPersistedRef.current = signatureForPayload(payload, job.jobId);
          setJobSaveError(null);
        })
        .catch(() => {
          setJobSaveError('We could not save your progress. We will keep trying automatically.');
        });
    }, 500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [getSnapshot, isSavingJob, jobId, persistenceEnabled, saveJob, setJobId, setJobSaveError]);

  return {
    activeJob,
    isActiveJobLoading,
    saveJob,
    isSavingJob,
    clearJob,
    isClearingJob,
    activeJobError,
    handleResumeExistingJob,
    handleDiscardExistingJob,
    markSnapshotSaved,
  };
}
