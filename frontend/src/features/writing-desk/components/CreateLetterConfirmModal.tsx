interface CreateLetterConfirmModalProps {
  open: boolean;
  creditCost: string;
  toneLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CreateLetterConfirmModal({
  open,
  creditCost,
  toneLabel,
  onConfirm,
  onCancel,
}: CreateLetterConfirmModalProps) {
  if (!open) return null;

  const toneDescription = toneLabel.trim().length > 0 ? `${toneLabel} tone` : 'selected tone';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-letter-confirm-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
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
        <h2 id="create-letter-confirm-title" style={{ fontSize: 24, lineHeight: 1.2, marginBottom: 12 }}>
          Lock in this tone?
        </h2>
        <p style={{ marginBottom: 16, color: '#334155', lineHeight: 1.6 }}>
          Selecting the <strong>{toneDescription}</strong> will spend <strong>{creditCost} credits</strong> and immediately
          begin drafting your letter.
        </p>
        <p style={{ marginBottom: 20, color: '#475569' }}>Once drafting starts, your tone choice is locked for this letter.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            type="button"
            onClick={onConfirm}
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
            Yes, start my letter
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              backgroundColor: 'transparent',
              color: '#1f2937',
              border: '1px solid #cbd5f5',
              borderRadius: 999,
              padding: '12px 20px',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            I&apos;ll choose another tone
          </button>
        </div>
      </div>
    </div>
  );
}
