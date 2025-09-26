"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';

type StepKey = 'issueDetail' | 'affectedDetail' | 'backgroundDetail' | 'desiredOutcome';

type FormState = Record<StepKey, string>;

const steps: Array<{
  key: StepKey;
  title: string;
  description: string;
  placeholder: string;
}> = [
  {
    key: 'issueDetail',
    title: 'Describe the issue in detail',
    description: 'Explain the situation as clearly as you can so the letter can state the facts.',
    placeholder: 'E.g. The heating in my flat has been broken since December and…',
  },
  {
    key: 'affectedDetail',
    title: 'Tell me who is affected and how',
    description: 'Share who is impacted – you, your family, neighbours, or the wider community.',
    placeholder: 'E.g. My young children are getting ill from the cold and elderly neighbours are…',
  },
  {
    key: 'backgroundDetail',
    title: 'Other supporting background',
    description: 'Mention any history, evidence, or previous actions taken so far.',
    placeholder: 'E.g. I have reported this to the council twice (ref 12345) and attached photos…',
  },
  {
    key: 'desiredOutcome',
    title: 'What do you want to happen?',
    description: 'State the outcome you hope to achieve so the MP knows what to push for.',
    placeholder: 'E.g. I want the housing association to replace the boiler within two weeks…',
  },
];

const initialFormState: FormState = {
  issueDetail: '',
  affectedDetail: '',
  backgroundDetail: '',
  desiredOutcome: '',
};

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
  const [ellipsisCount, setEllipsisCount] = useState(0);
  const [availableCredits, setAvailableCredits] = useState<number | null>(null);

  const currentStep = phase === 'initial' ? steps[stepIndex] ?? null : null;
  const followUpCreditCost = 0.1;
  const formatCredits = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return rounded.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  };
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

  const resetFollowUps = () => {
    setFollowUps([]);
    setFollowUpAnswers([]);
    setFollowUpIndex(0);
    setNotes(null);
    setResponseId(null);
  };

  const handleInitialChange = (value: string) => {
    if (!currentStep) return;
    setForm((prev) => ({ ...prev, [currentStep.key]: value }));
  };

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
      const res = await fetch('/api/ai/writing-desk/follow-up/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          issueDetail: form.issueDetail.trim(),
          affectedDetail: form.affectedDetail.trim(),
          backgroundDetail: form.backgroundDetail.trim(),
          desiredOutcome: form.desiredOutcome.trim(),
          followUpQuestions: questions,
          followUpAnswers: answers.map((answer) => answer.trim()),
          notes: (context?.notes ?? notes) ?? undefined,
          responseId: (context?.responseId ?? responseId) ?? undefined,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Request failed (${res.status})`);
      }
      setPhase('summary');
    } catch (err: any) {
      setServerError(err?.message || 'Something went wrong. Please try again.');
      setPhase(followUps.length > 0 ? 'followup' : 'initial');
    } finally {
      setLoading(false);
    }
  };

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

    if (availableCredits !== null && availableCredits < followUpCreditCost) {
      setError(`You need at least ${formatCredits(followUpCreditCost)} credits to generate follow-up questions.`);
      return;
    }

    // Final initial step – ask for follow-up questions
    setPhase('generating');
    setLoading(true);
    setServerError(null);
    try {
      const res = await fetch('/api/ai/writing-desk/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          issueDetail: form.issueDetail.trim(),
          affectedDetail: form.affectedDetail.trim(),
          backgroundDetail: form.backgroundDetail.trim(),
          desiredOutcome: form.desiredOutcome.trim(),
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Request failed (${res.status})`);
      }
      const json = await res.json();
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
      setServerError(err?.message || 'Something went wrong. Please try again.');
      setPhase('initial');
      const latestCredits = await refreshCredits();
      if (typeof latestCredits === 'number') {
        setAvailableCredits(latestCredits);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFollowUpChange = (value: string) => {
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
  };

  const handleStartOver = () => {
    setForm(initialFormState);
    setPhase('initial');
    setStepIndex(0);
    setFollowUpIndex(0);
    setError(null);
    setServerError(null);
    setLoading(false);
    resetFollowUps();
  };

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="container">
        <header style={{ marginBottom: 16 }}>
          <div className="section-header">
            <div>
              <h2 className="section-title">Tell us about the issue</h2>
              <p className="section-sub">We’ll use your answers to draft clarifying questions before the deep research step.</p>
            </div>
            <div className="header-actions" aria-hidden>
              <span className="badge">Step {Math.min(currentStepNumber, totalSteps)} of {totalSteps}</span>
              {availableCredits !== null && (
                <span className="badge" style={{ background: '#0f172a' }}>
                  Credits: {formatCredits(availableCredits)}
                </span>
              )}
            </div>
          </div>
          <div aria-hidden style={{ marginTop: 8, height: 6, background: '#e5e7eb', borderRadius: 999 }}>
            <div style={{ width: `${Math.min(progress, 100)}%`, height: '100%', background: '#2563eb', borderRadius: 999 }} />
          </div>
        </header>

        {phase === 'initial' && currentStep && (
          <form className="form-grid" onSubmit={(e) => { e.preventDefault(); void handleInitialNext(); }}>
            <div className="field">
              <label htmlFor={`writing-step-${currentStep.key}`} className="label">{currentStep.title}</label>
              <p className="label-sub">{currentStep.description}</p>
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
              className="actions"
              style={{
                marginTop: 12,
                display: 'flex',
                gap: 12,
                justifyContent: stepIndex === 0 ? 'flex-end' : undefined,
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
                  || (stepIndex === steps.length - 1 && availableCredits !== null && availableCredits < followUpCreditCost)
                }
              >
                {loading ? 'Thinking…' : stepIndex === steps.length - 1 ? 'Generate follow-up questions' : 'Next'}
              </button>
            </div>
            {stepIndex === steps.length - 1 && availableCredits !== null && availableCredits < followUpCreditCost && (
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

            <div className="actions" style={{ marginTop: 12, display: 'flex', gap: 12 }}>
              <button
                type="button"
                className="btn-link"
                onClick={handleFollowUpBack}
                disabled={loading}
              >
                Back
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={loading}
              >
                {loading ? 'Saving…' : followUpIndex === followUps.length - 1 ? 'Save answers' : 'Next'}
              </button>
            </div>
          </form>
        )}

        {phase === 'summary' && (
          <div className="result" aria-live="polite">
            <h3 className="section-title" style={{ fontSize: '1.25rem' }}>Initial summary captured</h3>
            <p className="section-sub">We’ve generated some clarifying questions before moving on to research.</p>

            <div className="card" style={{ padding: 16, marginTop: 16 }}>
              <h4 className="section-title" style={{ fontSize: '1rem' }}>What you told us</h4>
              <dl className="stack" style={{ marginTop: 12 }}>
                {steps.map((step) => (
                  <div key={step.key} style={{ marginBottom: 12 }}>
                    <dt style={{ fontWeight: 600 }}>{step.title}</dt>
                    <dd style={{ margin: '4px 0 0 0' }}>{form[step.key]}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="card" style={{ padding: 16, marginTop: 16 }}>
              <h4 className="section-title" style={{ fontSize: '1rem' }}>Follow-up questions</h4>
              {followUps.length > 0 ? (
                <ol style={{ marginTop: 8, paddingLeft: 20 }}>
                  {followUps.map((q, idx) => (
                    <li key={idx} style={{ marginBottom: 12 }}>
                      <p style={{ marginBottom: 4 }}>{q}</p>
                      <p style={{ margin: 0, fontWeight: 600 }}>Your answer:</p>
                      <p style={{ margin: '4px 0 0 0' }}>{followUpAnswers[idx]}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p style={{ marginTop: 8 }}>No additional questions needed — we have enough detail for the next step.</p>
              )}
              {notes && <p style={{ marginTop: 8, fontStyle: 'italic' }}>{notes}</p>}
              {responseId && (
                <p style={{ marginTop: 12, fontSize: '0.85rem', color: '#6b7280' }}>Reference ID: {responseId}</p>
              )}
            </div>

            <div className="actions" style={{ marginTop: 16, display: 'flex', gap: 12 }}>
              <button type="button" className="btn-primary" onClick={handleStartOver}>
                Start again
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
