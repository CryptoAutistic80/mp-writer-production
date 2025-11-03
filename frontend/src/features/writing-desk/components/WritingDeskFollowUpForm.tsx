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
    <>
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
          className={`actions${followUpIndex === 0 && isEditingFromSummary ? ' actions--primary-only' : ''}`}
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
      <style>{`
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

        .actions {
          margin-top: 12px;
          display: flex;
          gap: 12px;
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
