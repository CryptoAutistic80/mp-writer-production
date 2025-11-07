"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../../lib/api-client';
import ActiveJobResumeModal from '../../features/writing-desk/components/ActiveJobResumeModal';
import EditIntakeConfirmModal from '../../features/writing-desk/components/EditIntakeConfirmModal';
import StartOverConfirmModal from '../../features/writing-desk/components/StartOverConfirmModal';
import RecomposeConfirmModal from '../../features/writing-desk/components/RecomposeConfirmModal';
import ResearchConfirmModal from '../../features/writing-desk/components/ResearchConfirmModal';
import FollowUpsConfirmModal from '../../features/writing-desk/components/FollowUpsConfirmModal';
import EditFollowUpsConfirmModal from '../../features/writing-desk/components/EditFollowUpsConfirmModal';
import ExitWritingDeskModal from '../../features/writing-desk/components/ExitWritingDeskModal';
import CreateLetterConfirmModal from '../../features/writing-desk/components/CreateLetterConfirmModal';
import { useDeepResearchStream } from '../../features/writing-desk/hooks/useDeepResearchStream';
import { useLetterComposer } from '../../features/writing-desk/hooks/useLetterComposer';
import { WritingDeskIntakeForm } from '../../features/writing-desk/components/WritingDeskIntakeForm';
import { WritingDeskFollowUpForm } from '../../features/writing-desk/components/WritingDeskFollowUpForm';
import { WritingDeskSummary } from '../../features/writing-desk/components/WritingDeskSummary';
import type { WritingDeskLetterPanelProps } from '../../features/writing-desk/components/WritingDeskLetterPanel';
import { useWritingDeskPersistence } from '../../features/writing-desk/hooks/useWritingDeskPersistence';
import {
  ActiveWritingDeskJob,
  UpsertActiveWritingDeskJobPayload,
  WritingDeskLetterPayload,
  WritingDeskLetterStatus,
  WritingDeskLetterTone,
} from '../../features/writing-desk/types';
import { fetchSavedLetters, saveLetter } from '../../features/writing-desk/api/letter';
import {
  WRITING_DESK_STEPS,
  WRITING_DESK_INITIAL_FORM_STATE,
  WRITING_DESK_FOLLOW_UP_CREDIT_COST,
  WRITING_DESK_DEEP_RESEARCH_CREDIT_COST,
  WRITING_DESK_LETTER_CREDIT_COST,
  WRITING_DESK_LETTER_TONE_LABELS,
  formatCredits,
  type WritingDeskFormState,
  type WritingDeskStepKey,
  MAX_WRITING_DESK_LETTER_REASONING_ITEMS,
} from '../../features/writing-desk/utils';

type StepKey = WritingDeskStepKey;
type FormState = WritingDeskFormState;

const steps = WRITING_DESK_STEPS;
const initialFormState = WRITING_DESK_INITIAL_FORM_STATE;
export default function WritingDeskClient() {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [phase, setPhase] = useState<'initial' | 'generating' | 'followup' | 'summary'>('initial');
  const [stepIndex, setStepIndex] = useState(0);
  const [followUpIndex, setFollowUpIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState<string[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<string[]>([]);
  const [notes, setNotes] = useState<string | null>(null);
  const [responseId, setResponseId] = useState<string | null>(null);
  const [showSummaryDetails, setShowSummaryDetails] = useState(false);
  const [ellipsisCount, setEllipsisCount] = useState(0);
  const [availableCredits, setAvailableCredits] = useState<number | null>(null);
  const router = useRouter();
  const [jobId, setJobId] = useState<string | null>(null);
  const [hasHandledInitialJob, setHasHandledInitialJob] = useState(false);
  const [pendingJob, setPendingJob] = useState<ActiveWritingDeskJob | null>(null);
  const [resumeModalOpen, setResumeModalOpen] = useState(false);
  const [persistenceEnabled, setPersistenceEnabled] = useState(false);
  const [jobSaveError, setJobSaveError] = useState<string | null>(null);
  const [editIntakeModalOpen, setEditIntakeModalOpen] = useState(false);
  const [startOverConfirmOpen, setStartOverConfirmOpen] = useState(false);
  const previousPhaseRef = useRef<'initial' | 'generating' | 'followup' | 'summary' | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [recomposeConfirmOpen, setRecomposeConfirmOpen] = useState(false);
  const [createLetterConfirmOpen, setCreateLetterConfirmOpen] = useState(false);
  const [pendingTone, setPendingTone] = useState<WritingDeskLetterTone | null>(null);
  const [researchConfirmOpen, setResearchConfirmOpen] = useState(false);
  const [followUpsConfirmOpen, setFollowUpsConfirmOpen] = useState(false);
  const [editFollowUpsConfirmOpen, setEditFollowUpsConfirmOpen] = useState(false);
  const [initialFollowUpsConfirmOpen, setInitialFollowUpsConfirmOpen] = useState(false);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEditingFollowUpsFromSummary = useRef<boolean>(false);
  const pendingEditFollowUpIndexRef = useRef<number | null>(null);

  const clearToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToastMessage(null);
  }, []);

  const showToast = useCallback((message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToastMessage(message);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimeoutRef.current = null;
    }, 3500);
  }, []);

  const currentStep = phase === 'initial' ? steps[stepIndex] ?? null : null;
  const followUpCreditCost = WRITING_DESK_FOLLOW_UP_CREDIT_COST;
  const deepResearchCreditCost = WRITING_DESK_DEEP_RESEARCH_CREDIT_COST;
  const letterCreditCost = WRITING_DESK_LETTER_CREDIT_COST;
  const refreshCredits = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      if (typeof data?.credits === 'number') {
        return Math.round(data.credits * 100) / 100;
      }
    } catch {
      // Ignore transient failures, caller can decide how to handle null
    }
    return null;
  }, []);

  const reportRefundedFailure = useCallback(
    async (context: string) => {
      const message = `Sorry, ${context}. If we spent any credits, we've already refunded them.`;
      showToast(message);
      const latest = await refreshCredits();
      if (typeof latest === 'number') {
        setAvailableCredits(latest);
        return latest;
      }
      return null;
    },
    [refreshCredits, showToast],
  );

  const handleStreamCredits = useCallback((value: number | null | undefined) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      setAvailableCredits(Math.round(value * 100) / 100);
    }
  }, []);

  const {
    content: researchContent,
    responseId: researchResponseId,
    status: researchStatus,
    activities: researchActivities,
    error: researchError,
    start: startDeepResearch,
    reset: resetResearch,
    applySnapshot: applyResearchSnapshot,
  } = useDeepResearchStream({
    jobId,
    onJobIdChange: setJobId,
    onCreditsChange: handleStreamCredits,
    reportRefundedFailure,
    canAutoResume: hasHandledInitialJob,
  });

  const {
    status: letterStatus,
    phase: letterPhase,
    selectedTone,
    contentHtml: letterContentHtml,
    references: letterReferences,
    responseId: letterResponseId,
    rawJson: letterRawJson,
    error: letterError,
    events: letterEvents,
    statusMessage: letterStatusMessage,
    reasoningVisible: letterReasoningVisible,
    metadata: letterMetadata,
    isSaving: isSavingLetter,
    saveError: letterSaveError,
    savedResponseId: savedLetterResponseId,
    reset: resetLetter,
    begin: beginLetterComposition,
    resume: resumeLetterComposition,
    applySnapshot: applyLetterSnapshot,
    enterToneSelection,
    setPhase: setLetterPhase,
    setIsSaving: setIsSavingLetter,
    setSaveError: setLetterSaveError,
    setSavedResponseId,
  } = useLetterComposer({
    jobId,
    onJobIdChange: setJobId,
    onCreditsChange: handleStreamCredits,
    reportRefundedFailure,
    clearToast,
    canAutoResume: hasHandledInitialJob,
  });

  const letterIsSaved = useMemo(
    () => !!(letterResponseId && savedLetterResponseId === letterResponseId),
    [letterResponseId, savedLetterResponseId],
  );

  useEffect(() => () => {
    clearToast();
  }, [clearToast]);

  useEffect(() => {
    const responseIds = [letterResponseId, letterMetadata?.responseId].filter(
      (id): id is string => typeof id === 'string' && id.trim().length > 0,
    );
    if (!hasHandledInitialJob) return;
    if (responseIds.length === 0) return;
    const uniqueIds = Array.from(new Set(responseIds));

    let cancelled = false;

    (async () => {
      try {
        const existing = await fetchSavedLetters(uniqueIds);
        if (cancelled) return;
        const matched = existing.some((letter) => uniqueIds.includes(letter.responseId));
        if (matched) {
          setSavedResponseId(letterResponseId ?? letterMetadata?.responseId ?? null);
        }
      } catch (error) {
        console.warn('Failed to verify saved letter state', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasHandledInitialJob, letterMetadata?.responseId, letterResponseId, setSavedResponseId]);

  const totalFollowUpSteps = followUps.length > 0 ? followUps.length : 1;
  const totalSteps = steps.length + totalFollowUpSteps;
  const currentStepNumber = useMemo(() => {
    if (phase === 'initial') return stepIndex + 1;
    if (phase === 'generating') return steps.length;
    if (phase === 'followup') return steps.length + followUpIndex + 1;
    return steps.length + totalFollowUpSteps;
  }, [phase, stepIndex, followUpIndex, totalFollowUpSteps]);
  const completedSteps = useMemo(() => {
    if (phase === 'initial') return stepIndex;
    if (phase === 'generating') return steps.length;
    if (phase === 'followup') return steps.length + followUpIndex;
    return steps.length + totalFollowUpSteps;
  }, [phase, stepIndex, followUpIndex, totalFollowUpSteps]);
  const progress = useMemo(() => (completedSteps / totalSteps) * 100, [completedSteps, totalSteps]);
  const isGeneratingFollowUps = phase === 'generating';
  const creditState = useMemo<'loading' | 'low' | 'ok'>(() => {
    if (availableCredits === null) return 'loading';
    return availableCredits < followUpCreditCost ? 'low' : 'ok';
  }, [availableCredits, followUpCreditCost]);
  const creditClassName = useMemo(() => {
    const classes = ['credit-balance'];
    if (creditState === 'low') classes.push('credit-balance--low');
    if (creditState === 'loading') classes.push('credit-balance--loading');
    return classes.join(' ');
  }, [creditState]);
  const creditDisplayValue = availableCredits === null ? 'Checking…' : formatCredits(availableCredits);
  const creditAriaLabel =
    availableCredits === null
      ? 'Checking available credits'
      : `You have ${formatCredits(availableCredits)} credits available`;

  const visibleLetterEvents = useMemo(
    () => letterEvents.slice(0, MAX_WRITING_DESK_LETTER_REASONING_ITEMS),
    [letterEvents],
  );

  const researchCreditState = useMemo<'loading' | 'low' | 'ok'>(() => {
    if (availableCredits === null) return 'loading';
    return availableCredits < deepResearchCreditCost ? 'low' : 'ok';
  }, [availableCredits, deepResearchCreditCost]);
  const letterCreditState = useMemo<'loading' | 'low' | 'ok'>(() => {
    if (availableCredits === null) return 'loading';
    return availableCredits < letterCreditCost ? 'low' : 'ok';
  }, [availableCredits, letterCreditCost]);
  const hasResearchContent = researchContent.trim().length > 0;
  const researchButtonDisabled = researchStatus === 'running' || researchCreditState !== 'ok';
  const researchButtonLabel =
    researchStatus === 'running'
      ? 'Deep research in progress…'
      : hasResearchContent 
      ? 'Run deep research again' 
      : 'Start deep research';

  useEffect(() => {
    if (!isGeneratingFollowUps) {
      setEllipsisCount(0);
      return;
    }
    // Animate the status text while we wait for follow-up questions to arrive.
    const interval = window.setInterval(() => {
      setEllipsisCount((prev) => (prev + 1) % 5);
    }, 400);
    return () => {
      window.clearInterval(interval);
    };
  }, [isGeneratingFollowUps]);

  useEffect(() => {
    if (phase === 'summary' && previousPhaseRef.current !== 'summary') {
      setShowSummaryDetails(false);
    }
    previousPhaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const latest = await refreshCredits();
      if (!cancelled && typeof latest === 'number') {
        setAvailableCredits(latest);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshCredits]);

  const generatingMessage = `Generating follow-up questions${'.'.repeat((ellipsisCount % 5) + 1)}`;

  const resetFollowUps = useCallback(() => {
    setFollowUps([]);
    setFollowUpAnswers([]);
    setFollowUpIndex(0);
    setNotes(null);
    setResponseId(null);
    resetResearch();
    resetLetter();
  }, [resetLetter, resetResearch]);

  const resetLocalState = useCallback(() => {
    setForm({ ...initialFormState });
    setPhase('initial');
    setStepIndex(0);
    setFollowUpIndex(0);
    setError(null);
    setServerError(null);
    setLoading(false);
    setShowSummaryDetails(false);
    resetFollowUps();
    resetLetter();
  }, [resetFollowUps, resetLetter]);

  // Deep research stream handled via useDeepResearchStream hook.

  const applySnapshot = useCallback(
    (job: ActiveWritingDeskJob) => {
            setSavedResponseId(null);
      setLetterSaveError(null);
      setIsSavingLetter(false);
      clearToast();
      setForm({
        issueDescription: job.form?.issueDescription ?? '',
      });
      setPhase(job.phase);
      setStepIndex(Math.max(0, job.stepIndex ?? 0));
      const questions = Array.isArray(job.followUpQuestions) ? [...job.followUpQuestions] : [];
      setFollowUps(questions);
      const answers = questions.map((_, idx) => job.followUpAnswers?.[idx] ?? '');
      setFollowUpAnswers(answers);
      const maxFollowUpIndex = questions.length > 0 ? questions.length - 1 : 0;
      const nextFollowUpIndex = Math.max(0, Math.min(job.followUpIndex ?? 0, maxFollowUpIndex));
      setFollowUpIndex(nextFollowUpIndex);
      setNotes(job.notes ?? null);
      setResponseId(job.responseId ?? null);
      applyResearchSnapshot({
        researchContent: job.researchContent ?? '',
        researchResponseId: job.researchResponseId ?? null,
        researchStatus: job.researchStatus ?? null,
      });
      setError(null);
      setServerError(null);
      setShowSummaryDetails(false);
      setLoading(false);
      setJobSaveError(null);
      applyLetterSnapshot({
        letterStatus: job.letterStatus ?? null,
        letterTone: job.letterTone ?? null,
        letterResponseId: job.letterResponseId ?? null,
        letterContent: job.letterContent ?? null,
        letterReferences: job.letterReferences ?? null,
        letterJson: job.letterJson ?? null,
      });
    },
    [applyLetterSnapshot, applyResearchSnapshot, clearToast],
  );

  const resourceToPayload = useCallback(
    (job: ActiveWritingDeskJob): UpsertActiveWritingDeskJobPayload => ({
      jobId: job.jobId,
      phase: job.phase,
      stepIndex: job.stepIndex,
      followUpIndex: job.followUpIndex,
      form: {
        issueDescription: job.form?.issueDescription ?? '',
      },
      followUpQuestions: Array.isArray(job.followUpQuestions) ? [...job.followUpQuestions] : [],
      followUpAnswers: Array.isArray(job.followUpAnswers) ? [...job.followUpAnswers] : [],
      notes: job.notes ?? null,
      responseId: job.responseId ?? null,
      researchContent: job.researchContent ?? null,
      researchResponseId: job.researchResponseId ?? null,
      researchStatus: job.researchStatus ?? 'idle',
      letterStatus: job.letterStatus ?? 'idle',
      letterTone: job.letterTone ?? null,
      letterResponseId: job.letterResponseId ?? null,
      letterContent: job.letterContent ?? null,
      letterReferences: Array.isArray(job.letterReferences) ? [...job.letterReferences] : [],
      letterJson: job.letterJson ?? null,
    }),
    [],
  );

  const buildSnapshotPayload = useCallback(
    (): UpsertActiveWritingDeskJobPayload => ({
      jobId: jobId ?? undefined,
      phase,
      stepIndex,
      followUpIndex,
      form: { ...form },
      followUpQuestions: [...followUps],
      followUpAnswers: [...followUpAnswers],
      notes: notes ?? null,
      responseId: responseId ?? null,
      researchContent,
      researchResponseId: researchResponseId ?? null,
      researchStatus,
      letterStatus,
      letterTone: selectedTone,
      letterResponseId: letterResponseId ?? null,
      letterContent: letterContentHtml || null,
      letterReferences,
      letterJson: letterRawJson,
    }),
    [
      followUpAnswers,
      followUpIndex,
      followUps,
      form,
      jobId,
      notes,
      phase,
      researchContent,
      researchResponseId,
      researchStatus,
      responseId,
      stepIndex,
      letterStatus,
      selectedTone,
      letterResponseId,
      letterContentHtml,
      letterReferences,
      letterRawJson,
    ],
  );

  const getSnapshot = useCallback(() => buildSnapshotPayload(), [buildSnapshotPayload]);

  const {
    saveJob,
    clearJob,
    isClearingJob,
    handleResumeExistingJob,
    handleDiscardExistingJob,
    markSnapshotSaved,
  } = useWritingDeskPersistence({
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
    serializeJob: resourceToPayload,
    onApplySnapshot: applySnapshot,
    onResetLocalState: resetLocalState,
  });


  const handleInitialChange = (value: string) => {
    if (!currentStep) return;
    if (!persistenceEnabled) setPersistenceEnabled(true);
    setForm((prev) => ({ ...prev, [currentStep.key]: value }));
  };

  const handleTranscriptionComplete = useCallback((text: string) => {
    if (!currentStep) return;
    if (!persistenceEnabled) setPersistenceEnabled(true);
    setForm((prev) => ({ ...prev, [currentStep.key]: prev[currentStep.key] + (prev[currentStep.key] ? ' ' : '') + text }));
  }, [currentStep, persistenceEnabled]);

  const handleFollowUpTranscriptionComplete = useCallback((text: string) => {
    if (!persistenceEnabled) setPersistenceEnabled(true);
    setFollowUpAnswers((prev) => {
      const next = [...prev];
      next[followUpIndex] = next[followUpIndex] + (next[followUpIndex] ? ' ' : '') + text;
      return next;
    });
  }, [followUpIndex, persistenceEnabled]);

  const handleInitialBack = () => {
    setServerError(null);
    setError(null);
    if (stepIndex === 0) return;
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  const submitBundle = async (
    questions: string[],
    answers: string[],
    context?: { notes: string | null; responseId: string | null },
  ) => {
    setLoading(true);
    setServerError(null);
    try {
      await apiClient.post('/api/ai/writing-desk/follow-up/answers', {
        issueDescription: form.issueDescription.trim(),
        followUpQuestions: questions,
        followUpAnswers: answers.map((answer) => answer.trim()),
        notes: (context?.notes ?? notes) ?? undefined,
        responseId: (context?.responseId ?? responseId) ?? undefined,
      });
      const trimmedAnswers = answers.map((answer) => answer.trim());
      const resolvedNotes = (context?.notes ?? notes) ?? null;
      const resolvedResponseId = (context?.responseId ?? responseId) ?? null;

      setFollowUpAnswers(trimmedAnswers);
      setNotes(resolvedNotes);
      setResponseId(resolvedResponseId);
      setPhase('summary');
      setPersistenceEnabled(true);

      const payload: UpsertActiveWritingDeskJobPayload = {
        jobId: jobId ?? undefined,
        phase: 'summary',
        stepIndex,
        followUpIndex,
        form: { ...form },
        followUpQuestions: [...questions],
        followUpAnswers: trimmedAnswers,
        notes: resolvedNotes,
        responseId: resolvedResponseId,
      };

      try {
        const savedJob = await saveJob(payload);
        setJobId(savedJob.jobId);
        markSnapshotSaved(payload, savedJob.jobId);
        setJobSaveError(null);
      } catch {
        setJobSaveError('We could not save your progress. We will keep trying automatically.');
      }
    } catch (err: any) {
      setServerError(err?.message || 'Something went wrong. Please try again.');
      setPhase(followUps.length > 0 ? 'followup' : 'initial');
    } finally {
      setLoading(false);
    }
  };

  const generateFollowUps = useCallback(
    async (origin: 'initial' | 'summary') => {
      setError(null);
      setServerError(null);
      setLoading(true);

      let currentCredits = availableCredits;
      const refreshedCredits = await refreshCredits();
      if (typeof refreshedCredits === 'number') {
        currentCredits = refreshedCredits;
        setAvailableCredits(refreshedCredits);
      }

      if (currentCredits !== null && currentCredits < followUpCreditCost) {
        const message = `You need at least ${formatCredits(followUpCreditCost)} credits to generate follow-up questions.`;
        if (origin === 'initial') {
          setError(message);
        } else {
          setServerError(message);
        }
        setLoading(false);
        return;
      }

      setPhase('generating');

      const previousCredits = currentCredits;
      if (currentCredits !== null) {
        const optimisticCredits = Math.max(0, Math.round((currentCredits - followUpCreditCost) * 100) / 100);
        setAvailableCredits(optimisticCredits);
      }

      try {
        const json = await apiClient.post<{
          followUpQuestions: string[];
          notes: string | null;
          responseId: string | null;
          remainingCredits?: number;
        }>('/api/ai/writing-desk/follow-up', {
          issueDescription: form.issueDescription.trim(),
        });
        const questions: string[] = Array.isArray(json?.followUpQuestions)
          ? json.followUpQuestions.filter((q: unknown) => typeof q === 'string' && q.trim().length > 0)
          : [];
        setFollowUps(questions);
        setNotes(json?.notes ?? null);
        setResponseId(json?.responseId ?? null);
        if (typeof json?.remainingCredits === 'number') {
          setAvailableCredits(Math.round(json.remainingCredits * 100) / 100);
        } else {
          const latestCredits = await refreshCredits();
          if (typeof latestCredits === 'number') {
            setAvailableCredits(latestCredits);
          }
        }

        if (questions.length === 0) {
          setFollowUpAnswers([]);
          setFollowUpIndex(0);
          await submitBundle([], [], { notes: json?.notes ?? null, responseId: json?.responseId ?? null });
        } else {
          setFollowUpAnswers(questions.map(() => ''));
          setFollowUpIndex(0);
          setPhase('followup');
        }
      } catch (err: any) {
        const message = err?.message || 'Something went wrong. Please try again.';
        setServerError(message);
        if (origin === 'initial') {
          setPhase('initial');
          setStepIndex(steps.length - 1);
        } else {
          setPhase('summary');
        }
        const latestCredits = await reportRefundedFailure('follow-up question generation failed');
        if (latestCredits === null && previousCredits !== null) {
          setAvailableCredits(previousCredits);
        }
      } finally {
        setLoading(false);
      }
    },
    [availableCredits, followUpCreditCost, form, reportRefundedFailure, refreshCredits, submitBundle],
  );

  const handleInitialNext = async () => {
    if (!currentStep) return;
    const value = form[currentStep.key].trim();
    if (!value) {
      setError('Please provide an answer before continuing.');
      return;
    }
    setError(null);

    const isLastStep = stepIndex === steps.length - 1;
    if (!isLastStep) {
      setStepIndex((prev) => prev + 1);
      return;
    }

    if (followUps.length > 0) {
      setPhase('followup');
      setFollowUpIndex(Math.max(0, Math.min(followUpIndex, followUps.length - 1)));
      return;
    }

    // Show confirmation modal before generating initial follow-ups
    setInitialFollowUpsConfirmOpen(true);
  };

  const handleFollowUpChange = (value: string) => {
    if (!persistenceEnabled) setPersistenceEnabled(true);
    setFollowUpAnswers((prev) => {
      const next = [...prev];
      next[followUpIndex] = value;
      return next;
    });
  };

  const handleFollowUpBack = () => {
    setServerError(null);
    setError(null);
    if (followUpIndex === 0) {
      setPhase('initial');
      setStepIndex(steps.length - 1);
      return;
    }
    setFollowUpIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleFollowUpNext = async () => {
    const answer = followUpAnswers[followUpIndex]?.trim?.() ?? '';
    if (!answer) {
      setError('Please answer this question before continuing.');
      return;
    }
    setError(null);

    const nextAnswers = followUpAnswers.map((value, idx) => (idx === followUpIndex ? answer : value));
    setFollowUpAnswers(nextAnswers);

    const isLastFollowUp = followUpIndex === followUps.length - 1;
    if (!isLastFollowUp) {
      setFollowUpIndex((prev) => prev + 1);
      return;
    }

    await submitBundle(followUps, nextAnswers);
    // Reset the edit flag after submitting and returning to summary
    if (isEditingFollowUpsFromSummary.current) {
      isEditingFollowUpsFromSummary.current = false;
    }
  };

  const handleStartOver = useCallback(async () => {
    setJobSaveError(null);
    setPersistenceEnabled(false);
    setJobId(null);
    setHasHandledInitialJob(true);
    setPendingJob(null);
    setResumeModalOpen(false);
    resetLocalState();
    try {
      await clearJob();
    } catch {
      setJobSaveError('We could not clear your saved letter. Please try again.');
    }
  }, [clearJob, resetLocalState]);

  const handleConfirmStartOver = useCallback(() => {
    setStartOverConfirmOpen(false);
    void handleStartOver();
  }, [handleStartOver]);

  const handleCancelStartOver = useCallback(() => {
    setStartOverConfirmOpen(false);
  }, []);

  const handleEditInitialStep = useCallback(
    (stepKey: StepKey) => {
      const targetIndex = steps.findIndex((step) => step.key === stepKey);
      if (targetIndex === -1) return;
      setServerError(null);
      setError(null);
      setPhase('initial');
      setStepIndex(targetIndex);
    },
    [],
  );

  const handleConfirmEditIntake = useCallback(() => {
    resetFollowUps();
    setEditIntakeModalOpen(false);
    handleEditInitialStep('issueDescription');
  }, [handleEditInitialStep, resetFollowUps]);

  const handleCancelEditIntake = useCallback(() => {
    setEditIntakeModalOpen(false);
  }, []);

  const handleEditFollowUpQuestion = useCallback((index: number) => {
    if (index < 0 || index >= followUps.length) return;
    setServerError(null);
    setError(null);
    setPhase('followup');
    setFollowUpIndex(index);
    isEditingFollowUpsFromSummary.current = true;
  }, [followUps.length]);

  const handleConfirmEditFollowUps = useCallback(() => {
    const targetIndex = pendingEditFollowUpIndexRef.current ?? 0;
    pendingEditFollowUpIndexRef.current = null;
    setEditFollowUpsConfirmOpen(false);
    resetResearch();
    handleEditFollowUpQuestion(targetIndex);
  }, [handleEditFollowUpQuestion, resetResearch]);

  const handleCancelEditFollowUps = useCallback(() => {
    setEditFollowUpsConfirmOpen(false);
    pendingEditFollowUpIndexRef.current = null;
  }, []);

  const handleRequestEditFollowUps = useCallback((index: number) => {
    if (researchStatus === 'completed') {
      pendingEditFollowUpIndexRef.current = index;
      setEditFollowUpsConfirmOpen(true);
      return;
    }
    handleEditFollowUpQuestion(index);
  }, [handleEditFollowUpQuestion, researchStatus]);

  const handleConfirmInitialFollowUps = useCallback(() => {
    setInitialFollowUpsConfirmOpen(false);
    void generateFollowUps('initial');
  }, [generateFollowUps]);

  const handleCancelInitialFollowUps = useCallback(() => {
    setInitialFollowUpsConfirmOpen(false);
  }, []);

  const handleRequestRegenerateFollowUps = useCallback(() => {
    if (creditState !== 'ok') return;
    setFollowUpsConfirmOpen(true);
  }, [creditState]);

  const handleConfirmRegenerateFollowUps = useCallback(() => {
    setFollowUpsConfirmOpen(false);
    resetLetter();
    void generateFollowUps('summary');
  }, [generateFollowUps, resetLetter]);

  const handleCancelRegenerateFollowUps = useCallback(() => {
    setFollowUpsConfirmOpen(false);
  }, []);

  const handleShowToneSelection = useCallback(() => {
    setPendingTone(null);
    enterToneSelection();
    setShowSummaryDetails(false);
  }, [enterToneSelection]);

  const handleRequestCreateLetter = useCallback(() => {
    if (letterCreditState !== 'ok') return;
    handleShowToneSelection();
  }, [handleShowToneSelection, letterCreditState]);

  const handleConfirmCreateLetter = useCallback(() => {
    if (!pendingTone) {
      setCreateLetterConfirmOpen(false);
      return;
    }
    setCreateLetterConfirmOpen(false);
    const toneToUse = pendingTone;
    setPendingTone(null);
    void beginLetterComposition(toneToUse);
  }, [beginLetterComposition, pendingTone]);

  const handleCancelCreateLetter = useCallback(() => {
    setCreateLetterConfirmOpen(false);
    setPendingTone(null);
  }, []);

  const handleToneSelect = useCallback(
    (tone: WritingDeskLetterTone) => {
      if (letterCreditState !== 'ok') return;
      setPendingTone(tone);
      setCreateLetterConfirmOpen(true);
    },
    [letterCreditState],
  );

  const handleRequestRecompose = useCallback(() => {
    if (letterCreditState !== 'ok') return;
    setRecomposeConfirmOpen(true);
  }, [letterCreditState]);

  const handleConfirmRecompose = useCallback(() => {
    setRecomposeConfirmOpen(false);
    handleShowToneSelection();
  }, [handleShowToneSelection]);

  const handleCancelRecompose = useCallback(() => {
    setRecomposeConfirmOpen(false);
  }, []);

  const handleRequestExit = useCallback(() => {
    setExitConfirmOpen(true);
  }, []);

  const handleConfirmExit = useCallback(async () => {
    setExitConfirmOpen(false);
    try {
      await clearJob();
      router.push('/dashboard');
    } catch (error) {
      console.error('Failed to clear job:', error);
      // Still navigate even if clear fails
      router.push('/dashboard');
    }
  }, [clearJob, router]);

  const handleCancelExit = useCallback(() => {
    setExitConfirmOpen(false);
  }, []);

  const handleRequestResearch = useCallback(() => {
    setResearchConfirmOpen(true);
  }, []);

  const handleConfirmResearch = useCallback(() => {
    setResearchConfirmOpen(false);
    void startDeepResearch();
  }, [startDeepResearch]);

  const handleCancelResearch = useCallback(() => {
    setResearchConfirmOpen(false);
  }, []);

  const handleSaveLetter = useCallback(async () => {
    if (!letterMetadata || !letterContentHtml || !letterResponseId) {
      setLetterSaveError('Your letter is still preparing. Please wait a moment and try again.');
      return;
    }

    if (savedLetterResponseId && savedLetterResponseId === letterResponseId) {
      showToast('Letter already saved to My letters.');
      return;
    }

    const tone = (letterMetadata.tone ?? selectedTone ?? 'neutral') as WritingDeskLetterTone;
    const metadata: WritingDeskLetterPayload = {
      ...letterMetadata,
      tone,
      responseId: letterMetadata.responseId ?? letterResponseId,
    };

    setIsSavingLetter(true);
    setLetterSaveError(null);

    try {
      const saved = await saveLetter({
        responseId: letterResponseId,
        letterHtml: letterContentHtml,
        metadata,
      });
      setSavedResponseId(saved.responseId || letterResponseId);
      showToast('Letter saved to My letters.');
    } catch (error: any) {
      const message =
        error?.message && typeof error.message === 'string' && error.message.trim().length > 0
          ? error.message
          : 'We could not save your letter. Please try again.';
      setLetterSaveError(message);
    } finally {
      setIsSavingLetter(false);
    }
  }, [
    letterContentHtml,
    letterMetadata,
    letterResponseId,
    saveLetter,
    savedLetterResponseId,
    selectedTone,
    showToast,
  ]);

  const letterPanelProps: WritingDeskLetterPanelProps = {
    phase: letterPhase,
    status: letterStatus,
    statusMessage: letterStatusMessage,
    reasoningVisible: letterReasoningVisible,
    events: visibleLetterEvents,
    letterHtml: letterContentHtml,
    onToneSelect: handleToneSelect,
    onBackToSummary: () => setLetterPhase('idle'),
    onSaveLetter: handleSaveLetter,
    isSaving: isSavingLetter,
    responseId: letterResponseId,
    metadata: letterMetadata,
    savedResponseId: savedLetterResponseId,
    onRecompose: handleRequestRecompose,
    onExit: handleRequestExit,
    letterCreditState,
    letterError,
    onTryAgain: handleShowToneSelection,
    toastMessage,
    selectedTone: pendingTone ?? selectedTone,
  };

  const pendingToneLabel =
    pendingTone && WRITING_DESK_LETTER_TONE_LABELS[pendingTone]
      ? WRITING_DESK_LETTER_TONE_LABELS[pendingTone].label
      : pendingTone ?? '';

  return (
    <>
      <StartOverConfirmModal
        open={startOverConfirmOpen}
        onConfirm={handleConfirmStartOver}
        onCancel={handleCancelStartOver}
      />
      <RecomposeConfirmModal
        open={recomposeConfirmOpen}
        onConfirm={handleConfirmRecompose}
        onCancel={handleCancelRecompose}
        letterIsSaved={letterIsSaved}
      />
      <CreateLetterConfirmModal
        open={createLetterConfirmOpen && pendingTone !== null}
        creditCost={formatCredits(letterCreditCost)}
        toneLabel={pendingToneLabel}
        onConfirm={handleConfirmCreateLetter}
        onCancel={handleCancelCreateLetter}
      />
      <EditIntakeConfirmModal
        open={editIntakeModalOpen}
        creditCost={formatCredits(followUpCreditCost)}
        onConfirm={handleConfirmEditIntake}
        onCancel={handleCancelEditIntake}
      />
      <ResearchConfirmModal
        open={researchConfirmOpen}
        creditCost={formatCredits(deepResearchCreditCost)}
        isRerun={hasResearchContent}
        onConfirm={handleConfirmResearch}
        onCancel={handleCancelResearch}
      />
      <EditFollowUpsConfirmModal
        open={editFollowUpsConfirmOpen}
        creditCost={formatCredits(deepResearchCreditCost)}
        onConfirm={handleConfirmEditFollowUps}
        onCancel={handleCancelEditFollowUps}
      />
      <FollowUpsConfirmModal
        open={followUpsConfirmOpen}
        creditCost={formatCredits(followUpCreditCost)}
        onConfirm={handleConfirmRegenerateFollowUps}
        onCancel={handleCancelRegenerateFollowUps}
      />
      <FollowUpsConfirmModal
        open={initialFollowUpsConfirmOpen}
        creditCost={formatCredits(followUpCreditCost)}
        onConfirm={handleConfirmInitialFollowUps}
        onCancel={handleCancelInitialFollowUps}
        isInitialGeneration={true}
      />
      <ActiveJobResumeModal
        open={resumeModalOpen}
        job={pendingJob}
        onContinue={handleResumeExistingJob}
        onDiscard={() => {
          void handleDiscardExistingJob();
        }}
        isDiscarding={isClearingJob}
      />
      <ExitWritingDeskModal
        open={exitConfirmOpen}
        onConfirm={handleConfirmExit}
        onCancel={handleCancelExit}
      />
      <section className="card hero-card" style={{ marginTop: 16 }} aria-hidden={resumeModalOpen}>
        <div className="container">
        <header style={{ marginBottom: 16 }}>
          <div className="section-header">
            <div>
              <h2 className="section-title">Tell us about the issue</h2>
              <p className="section-sub">We’ll use your answers to shape clarifying prompts before the research stage.</p>
            </div>
            <div className="header-actions">
              <span className="badge">Step {Math.min(currentStepNumber, totalSteps)} of {totalSteps}</span>
              <div className={creditClassName} role="status" aria-live="polite" aria-label={creditAriaLabel}>
                <svg
                  className="credit-balance__icon"
                  viewBox="0 0 24 24"
                  aria-hidden
                  focusable="false"
                >
                  <path
                    d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z"
                    fill="currentColor"
                    opacity="0.25"
                  />
                  <path
                    d="M12 6v12m0-6h2.25a1.5 1.5 0 100-3H9.75a1.5 1.5 0 110-3H15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="credit-balance__content">
                  <span className="credit-balance__label">Credits</span>
                  <span className="credit-balance__value">{creditDisplayValue}</span>
                </div>
              </div>
            </div>
          </div>
          <div aria-hidden style={{ marginTop: 8, height: 6, background: '#e5e7eb', borderRadius: 999 }}>
            <div style={{ width: `${Math.min(progress, 100)}%`, height: '100%', background: '#2563eb', borderRadius: 999 }} />
          </div>
        </header>

        {jobSaveError && (
          <div className="status" aria-live="polite" style={{ marginBottom: 16 }}>
            <p style={{ color: '#b45309' }}>{jobSaveError}</p>
          </div>
        )}

        {phase === 'initial' && currentStep && (
          <WritingDeskIntakeForm
            step={currentStep}
            value={form[currentStep.key]}
            loading={loading}
            error={error}
            serverError={serverError}
            stepIndex={stepIndex}
            isFirstStep={stepIndex === 0}
            isLastStep={stepIndex === steps.length - 1}
            hasFollowUps={followUps.length > 0}
            creditState={creditState}
            availableCredits={availableCredits}
            followUpCreditCost={followUpCreditCost}
            formatCredits={formatCredits}
            onChange={handleInitialChange}
            onTranscriptionComplete={handleTranscriptionComplete}
            onBack={handleInitialBack}
            onSubmit={handleInitialNext}
          />
        )}

        {phase === 'generating' && (
          <div
            className="status"
            role="status"
            aria-live="polite"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '48px 0',
              textAlign: 'center',
              minHeight: 280,
            }}
          >
            <p style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#2563eb' }}>{generatingMessage}</p>
          </div>
        )}

        {phase === 'followup' && followUps.length > 0 && (
          <WritingDeskFollowUpForm
            question={followUps[followUpIndex]}
            followUpIndex={followUpIndex}
            totalFollowUps={followUps.length}
            value={followUpAnswers[followUpIndex] ?? ''}
            notes={notes}
            loading={loading}
            error={error}
            serverError={serverError}
            showBack={!(followUpIndex === 0 && isEditingFollowUpsFromSummary.current)}
            isEditingFromSummary={isEditingFollowUpsFromSummary.current}
            onChange={handleFollowUpChange}
            onTranscriptionComplete={handleFollowUpTranscriptionComplete}
            onBack={handleFollowUpBack}
            onSubmit={handleFollowUpNext}
          />
        )}

        {phase === 'summary' && (
          <WritingDeskSummary
            letterPhase={letterPhase}
            serverError={serverError}
            hasResearchContent={hasResearchContent}
            researchStatus={researchStatus}
            researchError={researchError}
            researchActivities={researchActivities}
            researchContent={researchContent}
            researchResponseId={researchResponseId}
            researchButtonDisabled={researchButtonDisabled}
            researchButtonLabel={researchButtonLabel}
            researchCreditState={researchCreditState}
            deepResearchCreditCost={deepResearchCreditCost}
            formatCredits={formatCredits}
            onRequestResearch={handleRequestResearch}
            showSummaryDetails={showSummaryDetails}
            onToggleSummaryDetails={() => setShowSummaryDetails((prev) => !prev)}
            steps={steps}
            form={form}
            followUps={followUps}
            followUpAnswers={followUpAnswers}
            onEditFollowUp={handleRequestEditFollowUps}
            onRegenerateFollowUps={handleRequestRegenerateFollowUps}
            creditState={creditState}
            followUpCreditCost={followUpCreditCost}
            notes={notes}
            responseId={responseId}
            loading={loading}
            onStartOver={() => setStartOverConfirmOpen(true)}
            onReviewFollowUps={() => handleRequestEditFollowUps(0)}
            letterCreditState={letterCreditState}
            letterCreditCost={letterCreditCost}
            onCreateLetter={handleRequestCreateLetter}
            letterPanelProps={letterPanelProps}
          />
        )}
      </div>
    </section>
    </>
  );
}
