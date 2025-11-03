"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
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
import { LetterViewer } from '../../features/writing-desk/components/LetterViewer';
import { useDeepResearchStream } from '../../features/writing-desk/hooks/useDeepResearchStream';
import { useLetterComposer } from '../../features/writing-desk/hooks/useLetterComposer';
import { useWritingDeskPersistence } from '../../features/writing-desk/hooks/useWritingDeskPersistence';
import {
  ActiveWritingDeskJob,
  UpsertActiveWritingDeskJobPayload,
  WritingDeskLetterPayload,
  WritingDeskLetterStatus,
  WritingDeskLetterTone,
  WRITING_DESK_LETTER_TONES,
} from '../../features/writing-desk/types';
import { fetchSavedLetters, saveLetter } from '../../features/writing-desk/api/letter';
import {
  WRITING_DESK_STEPS,
  WRITING_DESK_INITIAL_FORM_STATE,
  WRITING_DESK_LETTER_TONE_LABELS,
  WRITING_DESK_FOLLOW_UP_CREDIT_COST,
  WRITING_DESK_DEEP_RESEARCH_CREDIT_COST,
  WRITING_DESK_LETTER_CREDIT_COST,
  formatCredits,
  type WritingDeskFormState,
  type WritingDeskStepKey,
  MAX_WRITING_DESK_LETTER_REASONING_ITEMS,
} from '../../features/writing-desk/utils';
import { MicButton } from '../../components/audio/MicButton';
import { Toast } from '../../components/Toast';

type StepKey = WritingDeskStepKey;
type FormState = WritingDeskFormState;

const steps = WRITING_DESK_STEPS;
const initialFormState = WRITING_DESK_INITIAL_FORM_STATE;
const LETTER_TONE_LABELS = WRITING_DESK_LETTER_TONE_LABELS;

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
    enterToneSelection();
    setShowSummaryDetails(false);
  }, [enterToneSelection]);

  const handleRequestCreateLetter = useCallback(() => {
    if (letterCreditState !== 'ok') return;
    setCreateLetterConfirmOpen(true);
  }, [letterCreditState]);

  const handleConfirmCreateLetter = useCallback(() => {
    setCreateLetterConfirmOpen(false);
    handleShowToneSelection();
  }, [handleShowToneSelection]);

  const handleCancelCreateLetter = useCallback(() => {
    setCreateLetterConfirmOpen(false);
  }, []);

  const handleToneSelect = useCallback(
    (tone: WritingDeskLetterTone) => {
      void beginLetterComposition(tone);
    },
    [beginLetterComposition],
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
        open={createLetterConfirmOpen}
        creditCost={formatCredits(letterCreditCost)}
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
      <section className="card" style={{ marginTop: 16 }} aria-hidden={resumeModalOpen}>
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
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void handleInitialNext(); }}>
            <div className="field">
              <label htmlFor={`writing-step-${currentStep.key}`} className="label">{currentStep.title}</label>
              <p className="label-sub">{currentStep.description}</p>
              <div className="input-with-mic">
                <textarea
                  id={`writing-step-${currentStep.key}`}
                  className="input"
                  rows={6}
                  value={form[currentStep.key]}
                  onChange={(e) => handleInitialChange(e.target.value)}
                  placeholder={currentStep.placeholder}
                  aria-invalid={!!error && !form[currentStep.key].trim()}
                  disabled={loading}
                />
                <div className="input-mic-button">
                  <MicButton
                    onTranscriptionComplete={handleTranscriptionComplete}
                    disabled={loading}
                    size="sm"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="status" aria-live="assertive">
                <p style={{ color: '#b91c1c' }}>{error}</p>
              </div>
            )}

            {serverError && (
              <div className="status" aria-live="assertive">
                <p style={{ color: '#b91c1c' }}>{serverError}</p>
              </div>
            )}

            <div
              className={`actions${stepIndex === 0 ? ' actions--primary-only' : ''}`}
              style={{
                marginTop: 12,
                gap: 12,
                display: 'flex',
              }}
            >
              {stepIndex > 0 && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={handleInitialBack}
                  disabled={loading}
                >
                  Back
                </button>
              )}
              <button
                type="submit"
                className="btn-primary"
                disabled={
                  loading
                  ||
                  (stepIndex === steps.length - 1
                    && followUps.length === 0
                    && creditState !== 'ok')
                }
              >
                {loading
                  ? 'Thinking…'
                  : stepIndex === steps.length - 1
                    ? followUps.length > 0
                      ? 'Next'
                      : 'Generate follow-up questions'
                    : 'Next'}
              </button>
            </div>
            {stepIndex === steps.length - 1
              && followUps.length === 0
              && availableCredits !== null
              && availableCredits < followUpCreditCost && (
              <div className="status" aria-live="polite" style={{ marginTop: 8 }}>
                <p style={{ color: '#2563eb' }}>
                  Generating follow-up questions costs {formatCredits(followUpCreditCost)} credits. Please top up to continue.
                </p>
              </div>
            )}
          </form>
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
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void handleFollowUpNext(); }}>
            <div className="field">
              <label htmlFor={`followup-${followUpIndex}`} className="label">Follow-up question {followUpIndex + 1} of {followUps.length}</label>
              <p className="label-sub">{followUps[followUpIndex]}</p>
              <div className="input-with-mic">
                <textarea
                  id={`followup-${followUpIndex}`}
                  className="input"
                  rows={5}
                  value={followUpAnswers[followUpIndex] ?? ''}
                  onChange={(e) => handleFollowUpChange(e.target.value)}
                  placeholder="Type your answer here"
                  aria-invalid={!!error && !(followUpAnswers[followUpIndex]?.trim?.())}
                  disabled={loading}
                />
                <div className="input-mic-button">
                  <MicButton
                    onTranscriptionComplete={handleFollowUpTranscriptionComplete}
                    disabled={loading}
                    size="sm"
                  />
                </div>
              </div>
            </div>

            {notes && followUpIndex === 0 && (
              <div className="status" aria-live="polite">
                <p style={{ color: '#2563eb', fontStyle: 'italic' }}>{notes}</p>
              </div>
            )}

            {error && (
              <div className="status" aria-live="assertive">
                <p style={{ color: '#b91c1c' }}>{error}</p>
              </div>
            )}

            {serverError && (
              <div className="status" aria-live="assertive">
                <p style={{ color: '#b91c1c' }}>{serverError}</p>
              </div>
            )}

            <div className={`actions${followUpIndex === 0 && isEditingFollowUpsFromSummary.current ? ' actions--primary-only' : ''}`} style={{ marginTop: 12, display: 'flex', gap: 12 }}>
              {!(followUpIndex === 0 && isEditingFollowUpsFromSummary.current) && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={handleFollowUpBack}
                  disabled={loading}
                >
                  Back
                </button>
              )}
              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
              >
                {loading
                  ? 'Saving…'
                  : followUpIndex === followUps.length - 1
                    ? isEditingFollowUpsFromSummary.current
                      ? 'Back to research'
                      : 'Save answers'
                    : 'Next'}
              </button>
            </div>
          </form>
        )}

        {phase === 'summary' && (
          <div className="result" aria-live="polite">
            {letterPhase === 'idle' && (
              <>
                <h3 className="section-title" style={{ fontSize: '1.25rem' }}>Initial summary captured</h3>
                <p className="section-sub">Thanks for the detail. When you’re ready, start the research to gather supporting evidence.</p>

                {serverError && (
                  <div className="status" aria-live="assertive" style={{ marginTop: 12 }}>
                    <p style={{ color: '#b91c1c' }}>{serverError}</p>
                  </div>
                )}

                <div className="card" style={{ padding: 16, marginTop: 16 }}>
                  <h4 className="section-title" style={{ fontSize: '1rem' }}>Research evidence</h4>
                  {!hasResearchContent && researchStatus !== 'running' && (
                    <p style={{ marginTop: 8 }}>
                      Run research to gather cited evidence that supports your letter. The findings feed straight into your draft.
                    </p>
                  )}
                  {researchStatus === 'error' && researchError && (
                    <div className="status" aria-live="assertive" style={{ marginTop: 12 }}>
                      <p style={{ color: '#b91c1c' }}>{researchError}</p>
                    </div>
                  )}
                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleRequestResearch}
                      disabled={researchButtonDisabled}
                    >
                      {researchButtonLabel}
                    </button>
                    {researchCreditState === 'low' && (
                      <p style={{ marginTop: 8, color: '#b91c1c' }}>
                        You need at least {formatCredits(deepResearchCreditCost)} credits to run deep research.
                      </p>
                    )}
                    {researchCreditState === 'loading' && (
                      <p style={{ marginTop: 8, color: '#2563eb' }}>Checking your available credits…</p>
                    )}
                  </div>
                  {researchStatus === 'running' && (
                    <div className="research-progress" role="status" aria-live="polite">
                      <span className="research-progress__spinner" aria-hidden="true" />
                      <div className="research-progress__content">
                        <p>Gathering evidence — this can take approximately 15-30 minutes while we trace reliable sources.</p>
                        <p>We&apos;ll post updates in the activity feed below while the research continues.</p>
                      </div>
                    </div>
                  )}
                  {researchStatus === 'running' && researchActivities.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <h5 style={{ margin: '0 0 8px 0', fontSize: '0.95rem' }}>Latest activity</h5>
                      <ul style={{ paddingLeft: 18, margin: 0 }}>
                        {researchActivities.map((activity) => (
                          <li key={activity.id} style={{ marginBottom: 4 }}>
                            {activity.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {(hasResearchContent || researchStatus === 'running') && (
                    <div style={{ marginTop: 12 }}>
                      <h5 style={{ margin: '0 0 8px 0', fontSize: '0.95rem' }}>Research notes</h5>
                      <div className="research-notes">
                        {researchContent ? (
                          <ReactMarkdown
                            skipHtml
                            components={{
                              a: ({ node: _node, ...props }) => (
                                <a {...props} target="_blank" rel="noreferrer noopener" />
                              ),
                            }}
                          >
                            {researchContent}
                          </ReactMarkdown>
                        ) : (
                          <p className="research-notes__placeholder">Collecting evidence…</p>
                        )}
                      </div>
                    </div>
                  )}
                  {researchResponseId && (
                    <p style={{ marginTop: 12, fontSize: '0.85rem', color: '#6b7280' }}>
                      Research reference ID: {researchResponseId}
                    </p>
                  )}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => setShowSummaryDetails((prev) => !prev)}
                    disabled={loading}
                  >
                    {showSummaryDetails ? 'Hide intake details' : 'Show intake details'}
                  </button>
                  {responseId && !showSummaryDetails && (
                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>Reference ID: {responseId}</span>
                  )}
                </div>

                {showSummaryDetails && (
                  <>
                    <div className="card" style={{ padding: 16, marginTop: 16 }}>
                      <h4 className="section-title" style={{ fontSize: '1rem' }}>What you told us</h4>
                      <div className="stack" style={{ marginTop: 12 }}>
                        {steps.map((step) => (
                          <div key={step.key} style={{ marginBottom: 16 }}>
                            <div>
                              <h5 style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>{step.title}</h5>
                            </div>
                            <p style={{ margin: '6px 0 0 0' }}>{form[step.key]}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="card" style={{ padding: 16, marginTop: 16 }}>
                      <h4 className="section-title" style={{ fontSize: '1rem' }}>Follow-up questions</h4>
                      {followUps.length > 0 ? (
                        <ol style={{ marginTop: 8, paddingLeft: 20 }}>
                          {followUps.map((q, idx) => (
                            <li key={idx} style={{ marginBottom: 12 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'flex-start',
                                  gap: 12,
                                }}
                              >
                                <p style={{ marginBottom: 4 }}>{q}</p>
                                <button
                                  type="button"
                                  className="btn-link"
                                  onClick={() => handleRequestEditFollowUps(idx)}
                                  aria-label={`Edit answer for follow-up question ${idx + 1}`}
                                  disabled={loading}
                                >
                                  Edit answer
                                </button>
                              </div>
                              <p style={{ margin: 0, fontWeight: 600 }}>Your answer:</p>
                              <p style={{ margin: '4px 0 0 0' }}>{followUpAnswers[idx]}</p>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p style={{ marginTop: 8 }}>No additional questions needed — we have enough detail for the next step.</p>
                      )}
                      {followUps.length > 0 && (
                        <>
                          <div className="actions" style={{ marginTop: 12 }}>
                            <button
                              type="button"
                              className="btn-link"
                              onClick={handleRequestRegenerateFollowUps}
                              disabled={loading || creditState !== 'ok'}
                              style={{ opacity: loading || creditState !== 'ok' ? 0.5 : 1 }}
                            >
                              Ask for new follow-up questions
                            </button>
                          </div>
                          {creditState === 'low' && (
                            <p style={{ marginTop: 8, color: '#b91c1c' }}>
                              You need at least {formatCredits(followUpCreditCost)} credits to generate new follow-up
                              questions.
                            </p>
                          )}
                          {creditState === 'loading' && (
                            <p style={{ marginTop: 8, color: '#2563eb' }}>Checking your available credits…</p>
                          )}
                        </>
                      )}
                      {notes && <p style={{ marginTop: 8, fontStyle: 'italic' }}>{notes}</p>}
                      {responseId && (
                        <p style={{ marginTop: 12, fontSize: '0.85rem', color: '#6b7280' }}>Reference ID: {responseId}</p>
                      )}
                    </div>
                  </>
                )}

                <div
                  className="actions"
                  style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
                >
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setStartOverConfirmOpen(true)}
                    disabled={loading}
                  >
                    Start again
                  </button>
                  {followUps.length > 0 && (
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleRequestEditFollowUps(0)}
                      disabled={loading || researchStatus === 'running'}
                    >
                      Review / Edit Follow up answers
                    </button>
                  )}
                  {researchStatus === 'completed' && (
                    <button
                      type="button"
                      className="btn-primary create-letter-button"
                      onClick={handleRequestCreateLetter}
                      disabled={loading || letterCreditState !== 'ok'}
                    >
                      Create my letter
                    </button>
                  )}
                  {researchStatus === 'completed' && letterCreditState === 'low' && (
                    <p style={{ marginTop: 8, color: '#b91c1c' }}>
                      You need at least {formatCredits(letterCreditCost)} credits to create your letter.
                    </p>
                  )}
                  {researchStatus === 'completed' && letterCreditState === 'loading' && (
                    <p style={{ marginTop: 8, color: '#2563eb' }}>Checking your available credits…</p>
                  )}
                </div>
              </>
            )}

            {letterPhase === 'tone' && (
              <div className="card" style={{ padding: 16, marginTop: 16 }}>
                <h4 className="section-title" style={{ fontSize: '1.1rem' }}>Choose a tone for your letter</h4>
                <p className="section-sub">
                  Pick the style you want the drafted MP letter to use. You can always compose another letter later in a different tone.
                </p>
                <div className="tone-grid">
                  {WRITING_DESK_LETTER_TONES.map((tone) => {
                    const toneInfo = LETTER_TONE_LABELS[tone];
                    return (
                      <button
                        key={tone}
                        type="button"
                        className="tone-option"
                        data-tone={tone}
                        onClick={() => handleToneSelect(tone)}
                      >
                        <span className="tone-option__badge" aria-hidden="true">
                          {toneInfo.icon}
                        </span>
                        <span className="tone-option__label">{toneInfo.label}</span>
                        <span className="tone-option__description">{toneInfo.description}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="actions" style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                  <button type="button" className="btn-secondary" onClick={() => setLetterPhase('idle')}>
                    Back to summary
                  </button>
                </div>
              </div>
            )}

            {letterPhase === 'streaming' && (
              <div className="card" style={{ padding: 16, marginTop: 16 }}>
                <h4 className="section-title" style={{ fontSize: '1.1rem' }}>Drafting your letter</h4>
                {letterStatus === 'generating' && letterStatusMessage && (
                  <div
                    className="research-progress"
                    role="status"
                    aria-live="polite"
                    style={{ marginTop: 16 }}
                  >
                    <span className="research-progress__spinner" aria-hidden="true" />
                    <div className="research-progress__content">
                      <p>{letterStatusMessage}</p>
                      <p>We’ll keep posting updates in the reasoning feed while the letter takes shape.</p>
                    </div>
                  </div>
                )}
                {letterReasoningVisible && (
                  <div style={{ marginTop: 16 }}>
                    <h5 style={{ margin: '0 0 8px 0', fontSize: '0.95rem' }}>Reasoning feed</h5>
                    {visibleLetterEvents.length > 0 ? (
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {visibleLetterEvents.map((event) => (
                          <li key={event.id} style={{ marginBottom: 4 }}>{event.text}</li>
                        ))}
                      </ul>
                    ) : (
                      <p style={{ margin: 0, color: '#6b7280' }}>The assistant is planning the letter…</p>
                    )}
                  </div>
                )}
                <div style={{ marginTop: 16 }}>
                  <h5 style={{ margin: '0 0 8px 0', fontSize: '0.95rem' }}>Letter preview</h5>
                  <div
                    className="letter-preview"
                    dangerouslySetInnerHTML={{ __html: letterContentHtml || '<p>Drafting the opening paragraph…</p>' }}
                  />
                </div>
              </div>
            )}

            {letterPhase === 'completed' && letterMetadata && (
              <div className="card" style={{ padding: 16, marginTop: 16 }}>
                <h4 className="section-title" style={{ fontSize: '1.1rem' }}>Your drafted letter</h4>
                <p className="section-sub">
                  Tone: {selectedTone ? LETTER_TONE_LABELS[selectedTone].label : 'Not specified'} · Date {letterMetadata.date || new Date().toISOString().slice(0, 10)}
                </p>
                {letterResponseId && (
                  <p style={{ marginTop: 4, fontSize: '0.85rem', color: '#6b7280' }}>Letter reference ID: {letterResponseId}</p>
                )}
                <div style={{ marginTop: 16 }}>
                  <LetterViewer
                    letterHtml={letterContentHtml}
                    metadata={letterMetadata}
                    leadingActions={
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleSaveLetter}
                        disabled={
                          isSavingLetter ||
                          !letterResponseId ||
                          !letterMetadata ||
                          !letterContentHtml ||
                          (savedLetterResponseId !== null && savedLetterResponseId === letterResponseId)
                        }
                        aria-busy={isSavingLetter}
                      >
                        {isSavingLetter
                          ? 'Saving…'
                          : savedLetterResponseId === letterResponseId
                            ? 'Saved to my letters'
                            : 'Save to my letters'}
                      </button>
                    }
                    trailingActions={
                      <>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleRequestRecompose}
                          disabled={letterCreditState !== 'ok'}
                          style={{ opacity: letterCreditState !== 'ok' ? 0.6 : 1 }}
                        >
                          Recompose this letter
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleRequestExit}
                          style={{
                            backgroundColor: '#fee2e2',
                            color: '#991b1b',
                            border: '1px solid #fecaca'
                          }}
                        >
                          Exit writing desk
                        </button>
                      </>
                    }
                  />
                </div>
                {letterSaveError && (
                  <p role="alert" aria-live="polite" style={{ marginTop: 8, color: '#b91c1c' }}>
                    {letterSaveError}
                  </p>
                )}
                {toastMessage && <Toast>{toastMessage}</Toast>}
              </div>
            )}

            {letterPhase === 'error' && (
              <div className="card" style={{ padding: 16, marginTop: 16 }}>
                <h4 className="section-title" style={{ fontSize: '1.1rem', color: '#b91c1c' }}>We couldn&apos;t finish your letter</h4>
                {letterError && <p style={{ marginTop: 8 }}>{letterError}</p>}
                <div className="actions" style={{ marginTop: 16, display: 'flex', gap: 12 }}>
                  <button type="button" className="btn-primary" onClick={handleShowToneSelection}>
                    Try again
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setLetterPhase('idle')}>
                    Back to summary
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      </section>
      <style>{`
        @keyframes create-letter-jiggle {
          0%, 100% {
            transform: translateX(0);
          }
          15% {
            transform: translateX(-2px) rotate(-1deg);
          }
          30% {
            transform: translateX(2px) rotate(1deg);
          }
          45% {
            transform: translateX(-2px) rotate(-1deg);
          }
          60% {
            transform: translateX(2px) rotate(1deg);
          }
          75% {
            transform: translateX(-1px) rotate(-0.5deg);
          }
        }

        .tone-grid {
          display: grid;
          gap: 16px;
          margin-top: 16px;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }

        @media (max-width: 640px) {
          .tone-grid {
            grid-template-columns: 1fr;
          }

          .tone-option {
            padding: 16px;
          }
        }

        .tone-option {
          --tone-bg: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
          --tone-border: rgba(148, 163, 184, 0.4);
          --tone-heading: #0f172a;
          --tone-text: rgba(30, 41, 59, 0.82);
          --tone-badge-bg: rgba(15, 23, 42, 0.08);
          --tone-badge-fg: #0f172a;
          background: var(--tone-bg);
          border: 1px solid var(--tone-border);
          border-radius: 20px;
          color: var(--tone-text);
          cursor: pointer;
          display: flex;
          flex-direction: column;
          font-family: inherit;
          line-height: 1.4;
          gap: 12px;
          -webkit-appearance: none;
          appearance: none;
          padding: 18px 20px;
          position: relative;
          text-align: left;
          transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
          overflow: hidden;
        }

        .tone-option::after {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at top right, rgba(255, 255, 255, 0.55), transparent 55%);
          opacity: 0;
          transition: opacity 160ms ease;
        }

        .tone-option:hover,
        .tone-option:focus-visible {
          transform: translateY(-2px);
          box-shadow: 0 16px 32px rgba(15, 23, 42, 0.16);
          border-color: transparent;
        }

        .tone-option:hover::after,
        .tone-option:focus-visible::after {
          opacity: 1;
        }

        .tone-option:focus-visible {
          outline: 3px solid rgba(59, 130, 246, 0.45);
          outline-offset: 2px;
        }

        .tone-option__badge {
          align-items: center;
          background: var(--tone-badge-bg);
          border-radius: 16px;
          box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
          color: var(--tone-badge-fg);
          display: inline-flex;
          font-size: 1.75rem;
          height: 52px;
          justify-content: center;
          width: 52px;
        }

        .tone-option__label {
          color: var(--tone-heading);
          font-size: 1.05rem;
          font-weight: 600;
        }

        .tone-option__description {
          color: var(--tone-text);
          font-size: 0.9rem;
          line-height: 1.45;
        }

        .tone-option[data-tone='formal'] {
          --tone-bg: linear-gradient(135deg, #f8fafc 0%, #e0f2fe 100%);
          --tone-border: rgba(59, 130, 246, 0.35);
          --tone-heading: #1d4ed8;
          --tone-text: rgba(30, 64, 175, 0.88);
          --tone-badge-bg: rgba(37, 99, 235, 0.18);
          --tone-badge-fg: #1e3a8a;
        }

        .tone-option[data-tone='polite_but_firm'] {
          --tone-bg: linear-gradient(135deg, #fff7ed 0%, #fde68a 100%);
          --tone-border: rgba(217, 119, 6, 0.4);
          --tone-heading: #b45309;
          --tone-text: rgba(146, 64, 14, 0.9);
          --tone-badge-bg: rgba(180, 83, 9, 0.18);
          --tone-badge-fg: #9a3412;
        }

        .tone-option[data-tone='empathetic'] {
          --tone-bg: linear-gradient(135deg, #fdf2f8 0%, #ede9fe 100%);
          --tone-border: rgba(217, 70, 239, 0.35);
          --tone-heading: #a855f7;
          --tone-text: rgba(134, 25, 143, 0.86);
          --tone-badge-bg: rgba(168, 85, 247, 0.2);
          --tone-badge-fg: #7c3aed;
        }

        .tone-option[data-tone='urgent'] {
          --tone-bg: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
          --tone-border: rgba(248, 113, 113, 0.5);
          --tone-heading: #dc2626;
          --tone-text: rgba(153, 27, 27, 0.9);
          --tone-badge-bg: rgba(220, 38, 38, 0.22);
          --tone-badge-fg: #b91c1c;
        }

        .tone-option[data-tone='neutral'] {
          --tone-bg: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          --tone-border: rgba(71, 85, 105, 0.35);
          --tone-heading: #334155;
          --tone-text: rgba(51, 65, 85, 0.88);
          --tone-badge-bg: rgba(71, 85, 105, 0.18);
          --tone-badge-fg: #1e293b;
        }

        .tone-option[data-tone='highly_persuasive'] {
          --tone-bg: linear-gradient(135deg, #ecfeff 0%, #cffafe 100%);
          --tone-border: rgba(14, 165, 233, 0.38);
          --tone-heading: #0f766e;
          --tone-text: rgba(15, 118, 110, 0.9);
          --tone-badge-bg: rgba(13, 148, 136, 0.18);
          --tone-badge-fg: #115e59;
        }

        @media (prefers-reduced-motion: reduce) {
          .tone-option {
            transition: none;
          }

          .tone-option:hover,
          .tone-option:focus-visible {
            transform: none;
            box-shadow: 0 8px 18px rgba(15, 23, 42, 0.08);
          }

          .tone-option::after {
            transition: none;
          }
        }

        .create-letter-button {
          animation: create-letter-jiggle 1.6s ease-in-out infinite;
        }

        .create-letter-button:disabled {
          animation: none;
          opacity: 0.6;
          cursor: not-allowed;
        }

        .input-with-mic {
          position: relative;
          display: flex;
          align-items: flex-end;
          gap: 8px;
        }

        .input-with-mic .input {
          flex: 1;
          margin-bottom: 0;
        }

        .input-mic-button {
          flex-shrink: 0;
          margin-bottom: 8px;
        }

        .actions--primary-only {
          justify-content: flex-end;
        }

        @media (max-width: 640px) {
          .input-with-mic {
            display: block;
          }

          .input-with-mic .input {
            width: 100%;
            padding-right: 72px;
            padding-bottom: 72px;
          }

          .input-mic-button {
            position: absolute;
            right: 16px;
            bottom: 16px;
            transform: none;
            margin: 0;
          }

          .input-mic-button :global(.mic-button-container) {
            align-items: flex-end;
          }

          .input-mic-button :global(.mic-button__error) {
            margin-top: 8px;
            text-align: right;
            max-width: min(220px, 70vw);
          }

          .actions--primary-only {
            justify-content: center;
          }
        }
      `}</style>
    </>
  );
}
