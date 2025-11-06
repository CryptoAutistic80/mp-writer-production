"use client";

import ReactMarkdown from 'react-markdown';
import { WritingDeskLetterPhase, WritingDeskResearchStatus, WritingDeskStepKey } from '../utils/shared';
import { WritingDeskLetterPanel, WritingDeskLetterPanelProps } from './WritingDeskLetterPanel';

type WritingDeskStep = {
  key: WritingDeskStepKey;
  title: string;
  description: string;
  placeholder: string;
};

interface WritingDeskSummaryProps {
  letterPhase: WritingDeskLetterPhase;
  serverError: string | null;
  hasResearchContent: boolean;
  researchStatus: WritingDeskResearchStatus;
  researchError: string | null;
  researchActivities: Array<{ id: string; text: string }>;
  researchContent: string;
  researchResponseId: string | null;
  researchButtonDisabled: boolean;
  researchButtonLabel: string;
  researchCreditState: 'loading' | 'low' | 'ok';
  deepResearchCreditCost: number;
  formatCredits: (value: number) => string;
  onRequestResearch: () => void;
  showSummaryDetails: boolean;
  onToggleSummaryDetails: () => void;
  steps: WritingDeskStep[];
  form: Record<WritingDeskStepKey, string>;
  followUps: string[];
  followUpAnswers: string[];
  onEditFollowUp: (index: number) => void;
  onRegenerateFollowUps: () => void;
  creditState: 'loading' | 'low' | 'ok';
  followUpCreditCost: number;
  notes: string | null;
  responseId: string | null;
  loading: boolean;
  onStartOver: () => void;
  onReviewFollowUps: () => void;
  letterCreditState: 'loading' | 'low' | 'ok';
  letterCreditCost: number;
  onCreateLetter: () => void;
  letterPanelProps: WritingDeskLetterPanelProps;
}

export function WritingDeskSummary({
  letterPhase,
  serverError,
  hasResearchContent,
  researchStatus,
  researchError,
  researchActivities,
  researchContent,
  researchResponseId,
  researchButtonDisabled,
  researchButtonLabel,
  researchCreditState,
  deepResearchCreditCost,
  formatCredits,
  onRequestResearch,
  showSummaryDetails,
  onToggleSummaryDetails,
  steps,
  form,
  followUps,
  followUpAnswers,
  onEditFollowUp,
  onRegenerateFollowUps,
  creditState,
  followUpCreditCost,
  notes,
  responseId,
  loading,
  onStartOver,
  onReviewFollowUps,
  letterCreditState,
  letterCreditCost,
  onCreateLetter,
  letterPanelProps,
}: WritingDeskSummaryProps) {
  return (
    <>
      <div className="result" aria-live="polite">
        {letterPhase === 'idle' && (
          <>
            <h3 className="section-title" style={{ fontSize: '1.25rem' }}>Initial summary captured</h3>
            <p className="section-sub">
              Thanks for the detail. When you’re ready, start the research to gather supporting evidence.
          </p>

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
                onClick={onRequestResearch}
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
                        a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
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
              <p className="reference-id" style={{ marginTop: 12, fontSize: '0.85rem', color: '#6b7280' }}>
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
            <button type="button" className="btn-link" onClick={onToggleSummaryDetails} disabled={loading}>
              {showSummaryDetails ? 'Hide intake details' : 'Show intake details'}
            </button>
            {responseId && !showSummaryDetails && (
              <span className="reference-id" style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                Reference ID: {responseId}
              </span>
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
                    {followUps.map((question, idx) => (
                      <li key={idx} style={{ marginBottom: 12 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 12,
                          }}
                        >
                          <p style={{ marginBottom: 4 }}>{question}</p>
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => onEditFollowUp(idx)}
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
                  <p style={{ marginTop: 8 }}>
                    No additional questions needed — we have enough detail for the next step.
                  </p>
                )}
                {followUps.length > 0 && (
                  <>
                    <div className="actions" style={{ marginTop: 12 }}>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={onRegenerateFollowUps}
                        disabled={loading || creditState !== 'ok'}
                        style={{ opacity: loading || creditState !== 'ok' ? 0.5 : 1 }}
                      >
                        Ask for new follow-up questions
                      </button>
                    </div>
                    {creditState === 'low' && (
                      <p style={{ marginTop: 8, color: '#b91c1c' }}>
                        You need at least {formatCredits(followUpCreditCost)} credits to generate new follow-up questions.
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
            <button type="button" className="btn-secondary" onClick={onStartOver} disabled={loading}>
              Start again
            </button>
            {followUps.length > 0 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={onReviewFollowUps}
                disabled={loading || researchStatus === 'running'}
              >
                Review / Edit Follow up answers
              </button>
            )}
            {researchStatus === 'completed' && (
              <button
                type="button"
                className="btn-primary create-letter-button"
                onClick={onCreateLetter}
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

        {letterPhase !== 'idle' && <WritingDeskLetterPanel {...letterPanelProps} />}
      </div>
      <style>{`
        .result {
          display: flex;
          flex-direction: column;
        }

        .research-progress {
          display: flex;
          gap: 12px;
          margin-top: 16px;
          align-items: flex-start;
          background: #f8fafc;
          border-radius: 12px;
          padding: 12px;
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
          gap: 4px;
        }

        .research-notes {
          background: #ffffff;
          border-radius: 12px;
          padding: 16px;
          color: #1f2937;
          font-size: 0.92rem;
          line-height: 1.55;
          border: 1px solid rgba(15, 23, 42, 0.08);
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
        }

        .research-notes :global(a) {
          color: #2563eb;
          text-decoration: underline;
        }

        .research-notes__placeholder {
          margin: 0;
          color: #6b7280;
        }

        .create-letter-button {
          animation: create-letter-jiggle 1.6s ease-in-out infinite;
        }

        .create-letter-button:disabled {
          animation: none;
          opacity: 0.6;
          cursor: not-allowed;
        }

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

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}
