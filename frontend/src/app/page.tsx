export default function Index() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <a
        href="/api/auth/google"
        style={{
          padding: '12px 16px',
          borderRadius: 6,
          border: '1px solid #e2e8f0',
          background: 'white',
          color: '#111827',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Continue with Google
      </a>
    </main>
  );
}
