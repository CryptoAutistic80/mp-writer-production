interface FollowUpGuidanceModalProps {
  open: boolean;
  onClose: () => void;
}

export function FollowUpGuidanceModal({ open, onClose }: FollowUpGuidanceModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="follow-up-guidance-title"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 1100,
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          background: '#fff',
          borderRadius: 16,
          padding: '28px 32px',
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.25)',
        }}
      >
        <h2
          id="follow-up-guidance-title"
          style={{
            margin: 0,
            marginBottom: 12,
            fontSize: 24,
            lineHeight: 1.25,
            color: '#0f172a',
          }}
        >
          About the follow-up questions
        </h2>
        <p style={{ margin: '0 0 12px 0', color: '#334155', lineHeight: 1.6 }}>
          Answer each question in as much or as little detail as you like. Short bullet points are totally fine if that&apos;s all you have.
        </p>
        <p style={{ margin: '0 0 20px 0', color: '#334155', lineHeight: 1.6 }}>
          If you&apos;re unsure or the question doesn&apos;t apply, just type <strong>&quot;I don&apos;t know&quot;</strong> and move on — we&apos;ll work with whatever you can provide.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 999,
              padding: '12px 28px',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Okay
          </button>
        </div>
      </div>
    </div>
  );
}

