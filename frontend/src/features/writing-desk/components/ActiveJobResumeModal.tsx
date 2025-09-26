import { ActiveWritingDeskJob } from '../types';

interface ActiveJobResumeModalProps {
  open: boolean;
  job: ActiveWritingDeskJob | null;
  onContinue: () => void;
  onDiscard: () => void;
  isDiscarding: boolean;
}

export default function ActiveJobResumeModal({
  open,
  job,
  onContinue,
  onDiscard,
  isDiscarding,
}: ActiveJobResumeModalProps) {
  if (!open || !job) return null;

  const updated = job.updatedAt ? new Date(job.updatedAt) : null;
  const lastSaved = updated && !Number.isNaN(updated.valueOf()) ? updated : null;

  const formattedDate = lastSaved
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(lastSaved)
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="writing-desk-resume-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: '100%',
          background: 'white',
          borderRadius: 16,
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.25)',
          padding: '24px 28px',
        }}
      >
        <h2 id="writing-desk-resume-title" style={{ fontSize: 24, lineHeight: 1.2, marginBottom: 12 }}>
          Continue your saved letter?
        </h2>
        <p style={{ marginBottom: 16, color: '#334155', lineHeight: 1.6 }}>
          We found a draft you started previously. You can pick up where you left off or start a fresh letter.
        </p>
        {formattedDate && (
          <p style={{ marginBottom: 20, color: '#475569' }}>
            <strong>Last saved:</strong> {formattedDate}
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            type="button"
            onClick={onContinue}
            style={{
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 999,
              padding: '12px 20px',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Continue letter
          </button>
          <button
            type="button"
            onClick={onDiscard}
            disabled={isDiscarding}
            style={{
              backgroundColor: 'transparent',
              color: '#1f2937',
              border: '1px solid #cbd5f5',
              borderRadius: 999,
              padding: '12px 20px',
              fontSize: 16,
              fontWeight: 600,
              cursor: isDiscarding ? 'not-allowed' : 'pointer',
              opacity: isDiscarding ? 0.6 : 1,
            }}
          >
            {isDiscarding ? 'Clearing…' : 'Start a new letter'}
          </button>
        </div>
      </div>
    </div>
  );
}
