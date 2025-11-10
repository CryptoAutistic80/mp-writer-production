"use client";

import { Toast } from '../../../components/Toast';
import {
  WRITING_DESK_LETTER_TONES,
  WritingDeskLetterPayload,
  WritingDeskLetterStatus,
  WritingDeskLetterTone,
} from '../types';
import { WRITING_DESK_LETTER_TONE_LABELS } from '../utils';
import { WritingDeskLetterPhase } from '../utils/shared';
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
  let content = null;

  if (phase === 'tone') {
    content = (
      <section className="card writing-desk-card writing-desk-letter-panel" style={{ marginTop: 'var(--writing-desk-card-gap)' }}>
        <h4 className="section-title writing-desk-heading-md">
          Choose a tone for your letter
        </h4>
        <p className="section-sub writing-desk-body writing-desk-subtle">
          Pick the style you want the drafted MP letter to use. You can always compose another letter later in a different
          tone.
        </p>
        <div className="tone-grid">
          {WRITING_DESK_LETTER_TONES.map((tone) => {
            const toneMap =
              WRITING_DESK_LETTER_TONE_LABELS ?? ({} as Record<string, { label: string; description: string; icon: string }>);
            const toneInfo = toneMap[tone] ?? {
              label: tone,
              description: '',
              icon: '✉️',
            };
            const isSelected = selectedTone === tone;
            return (
              <button
                key={tone}
                type="button"
                className="tone-option"
                data-tone={tone}
                data-selected={isSelected ? 'true' : undefined}
                aria-pressed={isSelected}
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
        <div
          className="actions writing-desk-actions"
          style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.75)' }}
        >
          <button type="button" className="btn-secondary" onClick={onBackToSummary}>
            Back to summary
          </button>
        </div>
      </section>
    );
  } else if (phase === 'streaming') {
    content = (
      <section className="card writing-desk-card writing-desk-letter-panel" style={{ marginTop: 'var(--writing-desk-card-gap)' }}>
        <h4 className="section-title writing-desk-heading-md">
          Drafting your letter
        </h4>
        {status === 'generating' && statusMessage && (
          <div className="research-progress" role="status" aria-live="polite">
            <span className="research-progress__spinner" aria-hidden="true" />
            <div className="research-progress__content">
              <p className="writing-desk-body">{statusMessage}</p>
              <p className="writing-desk-body writing-desk-subtle">
                We’ll keep posting updates in the reasoning feed while the letter takes shape.
              </p>
            </div>
          </div>
        )}
        {reasoningVisible && (
          <div style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.6)' }}>
            <h5 className="writing-desk-heading-sm" style={{ margin: 0 }}>
              Reasoning feed
            </h5>
            {events.length > 0 ? (
              <ul className="writing-desk-list">
                {events.map((event) => (
                  <li key={event.id}>{event.text}</li>
                ))}
              </ul>
            ) : (
              <p className="writing-desk-body writing-desk-subtle" style={{ margin: 0 }}>
                The assistant is planning the letter…
              </p>
            )}
          </div>
        )}
        <div style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.6)' }}>
          <h5 className="writing-desk-heading-sm" style={{ margin: 0 }}>
            Letter preview
          </h5>
          <div className="letter-preview" dangerouslySetInnerHTML={{ __html: letterHtml || DEFAULT_PREVIEW }} />
        </div>
      </section>
    );
  } else if (phase === 'completed' && metadata) {
    const toneMap =
      WRITING_DESK_LETTER_TONE_LABELS ?? ({} as Record<string, { label: string; description: string; icon: string }>);
    const toneLabel = selectedTone ? toneMap[selectedTone]?.label ?? 'Not specified' : 'Not specified';
    const dateLabel = metadata.date || new Date().toISOString().slice(0, 10);
    const saveDisabled =
      isSaving || !responseId || !metadata || !letterHtml || (savedResponseId !== null && savedResponseId === responseId);

    content = (
      <section className="card writing-desk-card writing-desk-letter-panel" style={{ marginTop: 'var(--writing-desk-card-gap)' }}>
        <h4 className="section-title writing-desk-heading-md">
          Your drafted letter
        </h4>
        <p className="section-sub writing-desk-body writing-desk-subtle">
          Tone: {toneLabel} · Date {dateLabel}
        </p>
        {responseId && (
          <p className="reference-id writing-desk-reference" style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.35)' }}>
            Letter reference ID: {responseId}
          </p>
        )}
        <div style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.6)' }}>
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
      </section>
    );
  } else if (phase === 'error') {
    content = (
      <section className="card writing-desk-card writing-desk-letter-panel" style={{ marginTop: 'var(--writing-desk-card-gap)' }}>
        <h4 className="section-title writing-desk-heading-md" style={{ color: '#b91c1c' }}>
          We couldn&apos;t finish your letter
        </h4>
        {letterError && (
          <p className="writing-desk-body" style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.5)' }}>
            {letterError}
          </p>
        )}
        <div
          className="actions writing-desk-actions"
          style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.75)' }}
        >
          <button type="button" className="btn-primary" onClick={onTryAgain}>
            Try again
          </button>
          <button type="button" className="btn-secondary" onClick={onBackToSummary}>
            Back to summary
          </button>
        </div>
      </section>
    );
  }

  if (!content) {
    return null;
  }

  return (
    <>
      {content}
      <style>{`
        @keyframes create-letter-jiggle {
          0%,
          100% {
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
          gap: calc(var(--writing-desk-card-gap) * 0.75);
          margin-top: calc(var(--writing-desk-card-gap) * 0.75);
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }

        .tone-option {
          --tone-bg: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
          --tone-border: rgba(148, 163, 184, 0.4);
          --tone-border-strong: rgba(59, 130, 246, 0.55);
          --tone-heading: #1f2937;
          --tone-text: rgba(55, 65, 81, 0.85);
          --tone-badge-bg: rgba(59, 130, 246, 0.15);
          --tone-badge-fg: #1d4ed8;
          --tone-shadow: rgba(15, 23, 42, 0.12);
          width: 100%;
          text-align: left;
          border: 1px solid var(--tone-border);
          background: var(--tone-bg);
          border-radius: 16px;
          padding: calc(var(--writing-desk-card-padding) * 0.9);
          display: flex;
          flex-direction: column;
          gap: 8px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          position: relative;
        }

        .tone-option::after {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          border: 2px solid transparent;
          transition: border-color 0.2s ease;
        }

        .tone-option:hover,
        .tone-option:focus-visible {
          transform: translateY(-2px);
          box-shadow: 0 18px 40px var(--tone-shadow);
          outline: none;
        }

        .tone-option:hover::after,
        .tone-option:focus-visible::after {
          border-color: var(--tone-border-strong);
        }

        .tone-option[data-selected='true'] {
          transform: translateY(-1px);
          box-shadow: 0 20px 45px var(--tone-shadow);
        }

        .tone-option[data-selected='true']::after {
          border-color: var(--tone-border-strong);
        }

        .tone-option__badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: var(--tone-badge-bg);
          color: var(--tone-badge-fg);
          font-size: 1.25rem;
        }

        .tone-option__label {
          font-weight: 600;
          font-size: var(--writing-desk-subtitle-size);
          color: var(--tone-heading);
        }

        .tone-option__description {
          font-size: var(--writing-desk-body-size);
          line-height: var(--writing-desk-body-line);
          color: var(--tone-text);
        }

        .tone-option[data-tone='formal'] {
          --tone-bg: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
          --tone-border: rgba(99, 102, 241, 0.35);
          --tone-border-strong: rgba(79, 70, 229, 0.5);
          --tone-heading: #1e3a8a;
          --tone-text: rgba(30, 64, 175, 0.85);
          --tone-badge-bg: rgba(59, 130, 246, 0.16);
          --tone-badge-fg: #1d4ed8;
          --tone-shadow: rgba(59, 130, 246, 0.18);
        }

        .tone-option[data-tone='polite_but_firm'] {
          --tone-bg: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
          --tone-border: rgba(251, 191, 36, 0.4);
          --tone-border-strong: rgba(245, 158, 11, 0.55);
          --tone-heading: #92400e;
          --tone-text: rgba(180, 83, 9, 0.85);
          --tone-badge-bg: rgba(245, 158, 11, 0.18);
          --tone-badge-fg: #b45309;
          --tone-shadow: rgba(245, 158, 11, 0.18);
        }

        .tone-option[data-tone='empathetic'] {
          --tone-bg: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%);
          --tone-border: rgba(236, 72, 153, 0.35);
          --tone-border-strong: rgba(219, 39, 119, 0.5);
          --tone-heading: #a21caf;
          --tone-text: rgba(190, 24, 93, 0.82);
          --tone-badge-bg: rgba(236, 72, 153, 0.18);
          --tone-badge-fg: #db2777;
          --tone-shadow: rgba(219, 39, 119, 0.16);
        }

        .tone-option[data-tone='urgent'] {
          --tone-bg: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
          --tone-border: rgba(248, 113, 113, 0.4);
          --tone-border-strong: rgba(239, 68, 68, 0.55);
          --tone-heading: #b91c1c;
          --tone-text: rgba(220, 38, 38, 0.82);
          --tone-badge-bg: rgba(248, 113, 113, 0.2);
          --tone-badge-fg: #ef4444;
          --tone-shadow: rgba(239, 68, 68, 0.2);
        }

        .tone-option[data-tone='neutral'] {
          --tone-bg: linear-gradient(135deg, #f5f5f5 0%, #e5e7eb 100%);
          --tone-border: rgba(148, 163, 184, 0.45);
          --tone-border-strong: rgba(107, 114, 128, 0.6);
          --tone-heading: #374151;
          --tone-text: rgba(55, 65, 81, 0.85);
          --tone-badge-bg: rgba(107, 114, 128, 0.18);
          --tone-badge-fg: #4b5563;
          --tone-shadow: rgba(75, 85, 99, 0.16);
        }

        .tone-option[data-tone='highly_persuasive'] {
          --tone-bg: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%);
          --tone-border: rgba(168, 85, 247, 0.35);
          --tone-border-strong: rgba(147, 51, 234, 0.55);
          --tone-heading: #5b21b6;
          --tone-text: rgba(109, 40, 217, 0.82);
          --tone-badge-bg: rgba(147, 51, 234, 0.18);
          --tone-badge-fg: #7c3aed;
          --tone-shadow: rgba(147, 51, 234, 0.18);
        }

        .writing-desk-letter-panel .letter-preview {
          font-size: var(--writing-desk-body-size);
          line-height: var(--writing-desk-body-line);
        }

        .research-progress {
          display: flex;
          gap: calc(var(--writing-desk-card-gap) * 0.5);
          margin-top: calc(var(--writing-desk-card-gap) * 0.6);
          align-items: flex-start;
          background: #f8fafc;
          border-radius: 12px;
          padding: calc(var(--writing-desk-card-padding) * 0.75);
          border: 1px solid rgba(148, 163, 184, 0.35);
        }

        .research-progress__spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(59, 130, 246, 0.3);
          border-top-color: #2563eb;
          border-radius: 999px;
          animation: spin 0.8s linear infinite;
          margin-top: 4px;
        }

        .research-progress__content {
          display: flex;
          flex-direction: column;
          gap: calc(var(--writing-desk-card-gap) * 0.3);
        }

        @media (max-width: 720px) {
          .tone-grid {
            grid-template-columns: 1fr;
            gap: calc(var(--writing-desk-card-gap) * 0.6);
          }

          .tone-option {
            gap: 6px;
          }

          .tone-option__badge {
            width: 40px;
            height: 40px;
          }

          .writing-desk-letter-panel .letter-preview {
            font-size: clamp(0.82rem, 0.78rem + 0.6vw, 0.94rem);
            line-height: clamp(1.32, 1.28 + 0.22vw, 1.5);
          }

          .research-progress {
            flex-direction: column;
            align-items: stretch;
          }

          .research-progress__spinner {
            margin-top: 0;
          }
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
