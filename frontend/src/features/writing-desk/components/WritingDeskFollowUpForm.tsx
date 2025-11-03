"use client";

import { FormEvent } from 'react';
import { MicButton } from '../../../components/audio/MicButton';

interface WritingDeskFollowUpFormProps {
  question: string;
  followUpIndex: number;
  totalFollowUps: number;
  value: string;
  notes: string | null;
  loading: boolean;
  error: string | null;
  serverError: string | null;
  showBack: boolean;
  isEditingFromSummary: boolean;
  onChange: (value: string) => void;
  onTranscriptionComplete: (text: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}

export function WritingDeskFollowUpForm({
  question,
  followUpIndex,
  totalFollowUps,
  value,
  notes,
  loading,
  error,
  serverError,
  showBack,
  isEditingFromSummary,
  onChange,
  onTranscriptionComplete,
  onBack,
  onSubmit,
}: WritingDeskFollowUpFormProps) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  const isLastFollowUp = followUpIndex === totalFollowUps - 1;

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor={`followup-${followUpIndex}`} className="label">
          Follow-up question {followUpIndex + 1} of {totalFollowUps}
        </label>
        <p className="label-sub">{question}</p>
        <div className="input-with-mic">
          <textarea
            id={`followup-${followUpIndex}`}
            className="input"
            rows={5}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Type your answer here"
            aria-invalid={!!error && value.trim().length === 0}
            disabled={loading}
          />
          <div className="input-mic-button">
            <MicButton onTranscriptionComplete={onTranscriptionComplete} disabled={loading} size="sm" />
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

      <div
        className={`actions${
          followUpIndex === 0 && isEditingFromSummary ? ' actions--primary-only' : ''
        }`}
        style={{ marginTop: 12, display: 'flex', gap: 12 }}
      >
        {showBack && (
          <button type="button" className="btn-link" onClick={onBack} disabled={loading}>
            Back
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading
            ? 'Saving…'
            : isLastFollowUp
            ? isEditingFromSummary
              ? 'Back to research'
              : 'Save answers'
            : 'Next'}
        </button>
      </div>
    </form>
  );
}
