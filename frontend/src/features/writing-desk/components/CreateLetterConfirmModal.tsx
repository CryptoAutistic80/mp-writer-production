interface CreateLetterConfirmModalProps {
  open: boolean;
  creditCost: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CreateLetterConfirmModal({
  open,
  creditCost,
  onConfirm,
  onCancel,
}: CreateLetterConfirmModalProps) {
  if (!open) return null;

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
          Draft your letter now?
        </h2>
        <p style={{ marginBottom: 16, color: '#334155', lineHeight: 1.6 }}>
          Composing your letter will spend <strong>{creditCost} credits</strong>. We&apos;ll guide you through tone
          selection next.
        </p>
        <p style={{ marginBottom: 20, color: '#475569' }}>Do you want to continue?</p>
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
            Yes, create my letter
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
            Not yet
          </button>
        </div>
      </div>
    </div>
  );
}
