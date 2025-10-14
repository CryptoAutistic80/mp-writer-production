interface ExitWritingDeskModalProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ExitWritingDeskModal({ open, onConfirm, onCancel }: ExitWritingDeskModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exit-writing-desk-title"
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
        <h2 id="exit-writing-desk-title" style={{ fontSize: 24, lineHeight: 1.2, marginBottom: 12 }}>
          Exit writing desk?
        </h2>
        <p style={{ marginBottom: 16, color: '#334155', lineHeight: 1.6 }}>
          <strong style={{ color: '#b91c1c' }}>Warning:</strong> This will clear your current working session, including any unsaved progress, research, and drafts.
        </p>
        <p style={{ marginBottom: 16, color: '#334155', lineHeight: 1.6 }}>
          <strong style={{ color: '#0369a1' }}>Note:</strong> Letters you&apos;ve already saved to &quot;My Letters&quot; will not be affected.
        </p>
        <p style={{ marginBottom: 20, color: '#475569', fontWeight: 500 }}>
          Are you sure you want to exit?
        </p>
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
            Yes, exit and clear session
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
            No, keep working
          </button>
        </div>
      </div>
    </div>
  );
}

