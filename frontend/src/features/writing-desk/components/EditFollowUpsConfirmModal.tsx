interface EditFollowUpsConfirmModalProps {
  open: boolean;
  creditCost: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function EditFollowUpsConfirmModal({
  open,
  creditCost,
  onConfirm,
  onCancel,
}: EditFollowUpsConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-followups-confirm-title"
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
          border: '2px solid #b91c1c',
        }}
      >
        <h2
          id="edit-followups-confirm-title"
          style={{ fontSize: 24, lineHeight: 1.2, marginBottom: 12, color: '#b91c1c' }}
        >
          Return to follow-up questions?
        </h2>
        <p style={{ marginBottom: 16, color: '#7f1d1d', lineHeight: 1.6 }}>
          Returning to this step will erase the research findings and forfeit the {creditCost} credits spent on it.
        </p>
        <p style={{ marginBottom: 20, color: '#475569' }}>Do you want to continue?</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              backgroundColor: '#b91c1c',
              color: 'white',
              border: 'none',
              borderRadius: 999,
              padding: '12px 20px',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Yes, return to follow-ups
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
            No, stay here
          </button>
        </div>
      </div>
    </div>
  );
}

