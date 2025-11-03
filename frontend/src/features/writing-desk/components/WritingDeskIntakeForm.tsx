"use client";

import { FormEvent } from 'react';
import { MicButton } from '../../../components/audio/MicButton';
import { WritingDeskStepKey } from '../utils';

type WritingDeskStep = {
  key: WritingDeskStepKey;
  title: string;
  description: string;
  placeholder: string;
};

interface WritingDeskIntakeFormProps {
  step: WritingDeskStep;
  value: string;
  loading: boolean;
  error: string | null;
  serverError: string | null;
  stepIndex: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  hasFollowUps: boolean;
  creditState: 'loading' | 'low' | 'ok';
  availableCredits: number | null;
  followUpCreditCost: number;
  formatCredits: (value: number) => string;
  onChange: (value: string) => void;
  onTranscriptionComplete: (text: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function WritingDeskIntakeForm({
  step,
  value,
  loading,
  error,
  serverError,
  stepIndex,
  isFirstStep,
  isLastStep,
  hasFollowUps,
  creditState,
  availableCredits,
  followUpCreditCost,
  formatCredits,
  onChange,
  onTranscriptionComplete,
  onBack,
  onSubmit,
}: WritingDeskIntakeFormProps) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  const showGenerateMessage =
    isLastStep && !hasFollowUps && availableCredits !== null && availableCredits < followUpCreditCost;

  const primaryLabel = loading
    ? 'Thinking…'
    : isLastStep
    ? hasFollowUps
      ? 'Next'
      : 'Generate follow-up questions'
    : 'Next';

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor={`writing-step-${step.key}`} className="label">
          {step.title}
        </label>
        <p className="label-sub">{step.description}</p>
        <div className="input-with-mic">
          <textarea
            id={`writing-step-${step.key}`}
            className="input"
            rows={6}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={step.placeholder}
            aria-invalid={!!error && value.trim().length === 0}
            disabled={loading}
          />
          <div className="input-mic-button">
            <MicButton onTranscriptionComplete={onTranscriptionComplete} disabled={loading} size="sm" />
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
        className={`actions${isFirstStep ? ' actions--primary-only' : ''}`}
        style={{
          marginTop: 12,
          gap: 12,
          display: 'flex',
        }}
      >
        {!isFirstStep && (
          <button type="button" className="btn-link" onClick={onBack} disabled={loading}>
            Back
          </button>
        )}
        <button
          type="submit"
          className="btn-primary"
          disabled={loading || (isLastStep && !hasFollowUps && creditState !== 'ok')}
        >
          {primaryLabel}
        </button>
      </div>

      {showGenerateMessage && (
        <div className="status" aria-live="polite" style={{ marginTop: 8 }}>
          <p style={{ color: '#2563eb' }}>
            Generating follow-up questions costs {formatCredits(followUpCreditCost)} credits. Please top up to continue.
          </p>
        </div>
      )}
    </form>
  );
}
