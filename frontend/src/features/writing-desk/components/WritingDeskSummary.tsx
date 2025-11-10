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
      <div className="result writing-desk-summary" aria-live="polite">
        {letterPhase === 'idle' && (
          <>
            <h3 className="section-title writing-desk-heading-lg">
              Initial summary captured
            </h3>
            <p className="section-sub writing-desk-body writing-desk-subtle">
              Thanks for the detail. When you’re ready, start the research to gather supporting evidence.
            </p>

          {serverError && (
            <div
              className="status"
              aria-live="assertive"
              style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.6)' }}
            >
              <p className="writing-desk-body" style={{ color: '#b91c1c' }}>
                {serverError}
              </p>
            </div>
          )}

          <div className="card writing-desk-card" style={{ marginTop: 'var(--writing-desk-card-gap)' }}>
            <h4 className="section-title writing-desk-heading-md">
              Research evidence
            </h4>
            {!hasResearchContent && researchStatus !== 'running' && (
              <p
                className="writing-desk-body"
                style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.5)' }}
              >
                Run research to gather cited evidence that supports your letter. The findings feed straight into your draft.
              </p>
            )}
            {researchStatus === 'error' && researchError && (
              <div
                className="status"
                aria-live="assertive"
                style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.6)' }}
              >
                <p className="writing-desk-body" style={{ color: '#b91c1c' }}>
                  {researchError}
                </p>
              </div>
            )}
            <div style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.6)' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={onRequestResearch}
                disabled={researchButtonDisabled}
              >
                {researchButtonLabel}
              </button>
              {researchCreditState === 'low' && (
                <p
                  className="writing-desk-body"
                  style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.45)', color: '#b91c1c' }}
                >
                  You need at least {formatCredits(deepResearchCreditCost)} credits to run deep research.
                </p>
              )}
              {researchCreditState === 'loading' && (
                <p
                  className="writing-desk-body writing-desk-subtle"
                  style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.45)', color: '#2563eb' }}
                >
                  Checking your available credits…
                </p>
              )}
            </div>

            {researchStatus === 'running' && (
              <div className="research-progress" role="status" aria-live="polite">
                <span className="research-progress__spinner" aria-hidden="true" />
                <div className="research-progress__content">
                  <p className="writing-desk-body">
                    Gathering evidence — this can take approximately 15-30 minutes while we trace reliable sources.
                  </p>
                  <p className="writing-desk-body">
                    We&apos;ll post updates in the activity feed below while the research continues.
                  </p>
                </div>
              </div>
            )}

            {researchStatus === 'running' && researchActivities.length > 0 && (
              <div style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.6)' }}>
                <h5 className="writing-desk-heading-sm" style={{ margin: 0 }}>
                  Latest activity
                </h5>
                <ul className="writing-desk-list">
                  {researchActivities.map((activity) => (
                    <li key={activity.id}>{activity.text}</li>
                  ))}
                </ul>
              </div>
            )}

            {(hasResearchContent || researchStatus === 'running') && (
              <div style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.6)' }}>
                <h5 className="writing-desk-heading-sm" style={{ margin: 0 }}>
                  Research notes
                </h5>
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
                    <p className="research-notes__placeholder writing-desk-body writing-desk-subtle">
                      Collecting evidence…
                    </p>
                  )}
                </div>
              </div>
            )}

            {researchResponseId && (
              <p
                className="reference-id writing-desk-reference"
                style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.6)' }}
              >
                Research reference ID: {researchResponseId}
              </p>
            )}
          </div>

          <div className="writing-desk-meta-row">
            <button type="button" className="btn-link" onClick={onToggleSummaryDetails} disabled={loading}>
              {showSummaryDetails ? 'Hide intake details' : 'Show intake details'}
            </button>
            {responseId && !showSummaryDetails && (
              <span className="reference-id writing-desk-reference">
                Reference ID: {responseId}
              </span>
            )}
          </div>

          {showSummaryDetails && (
            <>
              <div className="card writing-desk-card" style={{ marginTop: 'var(--writing-desk-card-gap)' }}>
                <h4 className="section-title writing-desk-heading-md">
                  What you told us
                </h4>
                <div className="stack" style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.6)' }}>
                  {steps.map((step) => (
                    <div key={step.key} style={{ marginBottom: 'calc(var(--writing-desk-card-gap) * 0.75)' }}>
                      <div>
                        <h5 className="writing-desk-heading-sm" style={{ margin: 0 }}>
                          {step.title}
                        </h5>
                      </div>
                      <p className="writing-desk-body" style={{ margin: '6px 0 0 0' }}>
                        {form[step.key]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card writing-desk-card" style={{ marginTop: 'var(--writing-desk-card-gap)' }}>
                <h4 className="section-title writing-desk-heading-md">
                  Follow-up questions
                </h4>
                {followUps.length > 0 ? (
                  <ol
                    className="writing-desk-list writing-desk-list--ordered"
                    style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.5)' }}
                  >
                    {followUps.map((question, idx) => (
                      <li key={idx}>
                        <div className="writing-desk-follow-up-row">
                          <p className="writing-desk-body" style={{ marginBottom: 4 }}>
                            {question}
                          </p>
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
                        <p className="writing-desk-body" style={{ margin: 0, fontWeight: 600 }}>
                          Your answer:
                        </p>
                        <p className="writing-desk-body" style={{ margin: '4px 0 0 0' }}>
                          {followUpAnswers[idx]}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="writing-desk-body" style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.5)' }}>
                    No additional questions needed — we have enough detail for the next step.
                  </p>
                )}
                {followUps.length > 0 && (
                  <>
                    <div
                      className="actions writing-desk-actions"
                      style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.6)' }}
                    >
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
                      <p
                        className="writing-desk-body"
                        style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.45)', color: '#b91c1c' }}
                      >
                        You need at least {formatCredits(followUpCreditCost)} credits to generate new follow-up questions.
                      </p>
                    )}
                    {creditState === 'loading' && (
                      <p
                        className="writing-desk-body writing-desk-subtle"
                        style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.45)', color: '#2563eb' }}
                      >
                        Checking your available credits…
                      </p>
                    )}
                  </>
                )}
                {notes && (
                  <p className="writing-desk-body" style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.5)', fontStyle: 'italic' }}>
                    {notes}
                  </p>
                )}
                {responseId && (
                  <p
                    className="writing-desk-reference"
                    style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.6)' }}
                  >
                    Reference ID: {responseId}
                  </p>
                )}
              </div>
            </>
          )}

          <div className="actions writing-desk-actions" style={{ marginTop: 'var(--writing-desk-card-gap)' }}>
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
              <p
                className="writing-desk-body"
                style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.45)', color: '#b91c1c' }}
              >
                You need at least {formatCredits(letterCreditCost)} credits to create your letter.
              </p>
            )}
            {researchStatus === 'completed' && letterCreditState === 'loading' && (
              <p
                className="writing-desk-body writing-desk-subtle"
                style={{ marginTop: 'calc(var(--writing-desk-card-gap) * 0.45)', color: '#2563eb' }}
              >
                Checking your available credits…
              </p>
            )}
          </div>
        </>
      )}

        {letterPhase !== 'idle' && <WritingDeskLetterPanel {...letterPanelProps} />}
      </div>
      <style>{`
        .writing-desk-summary {
          display: flex;
          flex-direction: column;
          gap: var(--writing-desk-card-gap);
        }

        .writing-desk-summary .research-progress {
          display: flex;
          gap: calc(var(--writing-desk-card-gap) * 0.5);
          margin-top: calc(var(--writing-desk-card-gap) * 0.6);
          align-items: flex-start;
          background: #f8fafc;
          border-radius: 12px;
          padding: calc(var(--writing-desk-card-padding) * 0.75);
          border: 1px solid rgba(148, 163, 184, 0.35);
        }

        .writing-desk-summary .research-progress__spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(59, 130, 246, 0.3);
          border-top-color: #2563eb;
          border-radius: 999px;
          animation: spin 0.8s linear infinite;
          margin-top: 4px;
        }

        .writing-desk-summary .research-progress__content {
          display: flex;
          flex-direction: column;
          gap: calc(var(--writing-desk-card-gap) * 0.3);
        }

        .writing-desk-summary .research-notes {
          background: #ffffff;
          border-radius: 12px;
          padding: calc(var(--writing-desk-card-padding) * 0.85);
          color: #1f2937;
          font-size: var(--writing-desk-body-size);
          line-height: var(--writing-desk-body-line);
          border: 1px solid rgba(15, 23, 42, 0.08);
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
          max-height: min(52vh, 280px);
          overflow-y: auto;
          overflow-x: hidden;
        }

        .writing-desk-summary .research-notes :global(a) {
          color: #2563eb;
          text-decoration: underline;
        }

        .writing-desk-summary .research-notes__placeholder {
          margin: 0;
        }

        .writing-desk-meta-row {
          margin-top: calc(var(--writing-desk-card-gap) * 0.6);
          display: flex;
          flex-wrap: wrap;
          gap: calc(var(--writing-desk-card-gap) * 0.5);
          align-items: center;
        }

        .writing-desk-follow-up-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: calc(var(--writing-desk-card-gap) * 0.5);
        }

        @media (max-width: 720px) {
          .writing-desk-summary .research-progress {
            flex-direction: column;
            align-items: stretch;
          }

          .writing-desk-summary .research-progress__spinner {
            margin-top: 0;
          }

          .writing-desk-meta-row {
            flex-direction: column;
            align-items: flex-start;
          }

          .writing-desk-follow-up-row {
            flex-direction: column;
            align-items: stretch;
          }

          .writing-desk-summary .research-notes {
            max-height: min(48vh, 240px);
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
