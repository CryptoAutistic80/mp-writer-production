"use client";

import { ReactNode } from 'react';
import { Toast } from '../../../components/Toast';
import { WRITING_DESK_LETTER_TONES, WritingDeskLetterPayload, WritingDeskLetterTone } from '../types';
import { LETTER_TONE_LABELS } from '../utils';
import { WritingDeskLetterPhase, WritingDeskLetterStatus } from '../utils/shared';
import { LetterViewer } from './LetterViewer';

export interface WritingDeskLetterPanelProps {
  phase: WritingDeskLetterPhase;
  status: WritingDeskLetterStatus;
  statusMessage: string | null;
  reasoningVisible: boolean;
  events: Array<{ id: string; text: string }>;
  letterHtml: string;
  onToneSelect: (tone: WritingDeskLetterTone) => void;
  onBackToSummary: () => void;
  onSaveLetter: () => void | Promise<void>;
  isSaving: boolean;
  responseId: string | null;
  metadata: WritingDeskLetterPayload | null;
  savedResponseId: string | null;
  onRecompose: () => void;
  onExit: () => void;
  letterCreditState: 'loading' | 'low' | 'ok';
  letterError: string | null;
  onTryAgain: () => void;
  toastMessage: string | null;
  selectedTone: WritingDeskLetterTone | null;
}

const DEFAULT_PREVIEW = '<p>Drafting the opening paragraph…</p>';

export function WritingDeskLetterPanel({
  phase,
  status,
  statusMessage,
  reasoningVisible,
  events,
  letterHtml,
  onToneSelect,
  onBackToSummary,
  onSaveLetter,
  isSaving,
  responseId,
  metadata,
  savedResponseId,
  onRecompose,
  onExit,
  letterCreditState,
  letterError,
  onTryAgain,
  toastMessage,
  selectedTone,
}: WritingDeskLetterPanelProps) {
  if (phase === 'tone') {
    return (
      <div className="card" style={{ padding: 16, marginTop: 16 }}>
        <h4 className="section-title" style={{ fontSize: '1.1rem' }}>Choose a tone for your letter</h4>
        <p className="section-sub">
          Pick the style you want the drafted MP letter to use. You can always compose another letter later in a different
          tone.
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
                onClick={() => onToneSelect(tone)}
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
          <button type="button" className="btn-secondary" onClick={onBackToSummary}>
            Back to summary
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'streaming') {
    return (
      <div className="card" style={{ padding: 16, marginTop: 16 }}>
        <h4 className="section-title" style={{ fontSize: '1.1rem' }}>Drafting your letter</h4>
        {status === 'generating' && statusMessage && (
          <div className="research-progress" role="status" aria-live="polite" style={{ marginTop: 16 }}>
            <span className="research-progress__spinner" aria-hidden="true" />
            <div className="research-progress__content">
              <p>{statusMessage}</p>
              <p>We’ll keep posting updates in the reasoning feed while the letter takes shape.</p>
            </div>
          </div>
        )}
        {reasoningVisible && (
          <div style={{ marginTop: 16 }}>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '0.95rem' }}>Reasoning feed</h5>
            {events.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {events.map((event) => (
                  <li key={event.id} style={{ marginBottom: 4 }}>
                    {event.text}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, color: '#6b7280' }}>The assistant is planning the letter…</p>
            )}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <h5 style={{ margin: '0 0 8px 0', fontSize: '0.95rem' }}>Letter preview</h5>
          <div className="letter-preview" dangerouslySetInnerHTML={{ __html: letterHtml || DEFAULT_PREVIEW }} />
        </div>
      </div>
    );
  }

  if (phase === 'completed' && metadata) {
    const toneLabel = selectedTone ? LETTER_TONE_LABELS[selectedTone].label : 'Not specified';
    const dateLabel = metadata.date || new Date().toISOString().slice(0, 10);
    const saveDisabled =
      isSaving || !responseId || !metadata || !letterHtml || (savedResponseId !== null && savedResponseId === responseId);

    return (
      <div className="card" style={{ padding: 16, marginTop: 16 }}>
        <h4 className="section-title" style={{ fontSize: '1.1rem' }}>Your drafted letter</h4>
        <p className="section-sub">
          Tone: {toneLabel} · Date {dateLabel}
        </p>
        {responseId && (
          <p style={{ marginTop: 4, fontSize: '0.85rem', color: '#6b7280' }}>Letter reference ID: {responseId}</p>
        )}
        <div style={{ marginTop: 16 }}>
          <LetterViewer
            letterHtml={letterHtml}
            metadata={metadata}
            leadingActions={
              <button
                type="button"
                className="btn-primary"
                onClick={onSaveLetter}
                disabled={saveDisabled}
                aria-busy={isSaving}
              >
                {isSaving
                  ? 'Saving…'
                  : savedResponseId === responseId
                    ? 'Saved to my letters'
                    : 'Save to my letters'}
              </button>
            }
            trailingActions={
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onRecompose}
                  disabled={letterCreditState !== 'ok'}
                  style={{ opacity: letterCreditState !== 'ok' ? 0.6 : 1 }}
                >
                  Recompose this letter
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={onExit}
                  style={{
                    backgroundColor: '#fee2e2',
                    color: '#991b1b',
                    border: '1px solid #fecaca',
                  }}
                >
                  Exit writing desk
                </button>
              </>
            }
          />
        </div>
        {toastMessage && <Toast>{toastMessage}</Toast>}
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="card" style={{ padding: 16, marginTop: 16 }}>
        <h4 className="section-title" style={{ fontSize: '1.1rem', color: '#b91c1c' }}>
          We couldn&apos;t finish your letter
        </h4>
        {letterError && <p style={{ marginTop: 8 }}>{letterError}</p>}
        <div className="actions" style={{ marginTop: 16, display: 'flex', gap: 12 }}>
          <button type="button" className="btn-primary" onClick={onTryAgain}>
            Try again
          </button>
          <button type="button" className="btn-secondary" onClick={onBackToSummary}>
            Back to summary
          </button>
        </div>
      </div>
    );
  }

  return null;
}
