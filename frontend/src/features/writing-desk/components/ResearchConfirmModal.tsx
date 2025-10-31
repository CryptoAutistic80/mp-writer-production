interface ResearchConfirmModalProps {
  open: boolean;
  creditCost: string;
  isRerun: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ResearchConfirmModal({
  open,
  creditCost,
  isRerun,
  onConfirm,
  onCancel,
}: ResearchConfirmModalProps) {
  if (!open) return null;

  const accentColor = isRerun ? '#b91c1c' : '#2563eb';
  const accentMutedColor = isRerun ? '#7f1d1d' : '#334155';
  const cancelBorderColor = isRerun ? '#fca5a5' : '#cbd5f5';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="research-confirm-title"
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
        border: isRerun ? '2px solid #b91c1c' : undefined,
      }}
    >
      <h2
        id="research-confirm-title"
        style={{ fontSize: 24, lineHeight: 1.2, marginBottom: 12, color: accentColor }}
      >
        {isRerun ? 'Run deep research again?' : 'Start deep research?'}
      </h2>
      <p style={{ marginBottom: 16, color: accentMutedColor, lineHeight: 1.6 }}>
        <strong style={{ color: accentColor }}>Cost:</strong> This will use <strong>{creditCost} credits</strong> to run deep research.
      </p>
      {isRerun && (
        <p style={{ marginBottom: 16, color: accentMutedColor, lineHeight: 1.6 }}>
          Re-running will replace your current research findings and the credits previously spent are forfeited.
        </p>
      )}
      <p style={{ marginBottom: 20, color: '#475569' }}>Do you want to continue?</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            backgroundColor: accentColor,
            color: 'white',
            border: 'none',
            borderRadius: 999,
            padding: '12px 20px',
            fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isRerun ? 'Yes, run again' : 'Yes, start research'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              backgroundColor: 'transparent',
              color: '#1f2937',
              border: `1px solid ${cancelBorderColor}`,
              borderRadius: 999,
              padding: '12px 20px',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
