import Link from 'next/link';

export default function CheckoutCancelledPage() {
  return (
    <main className="hero-section">
      <section className="card">
        <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <header>
            <h1 className="section-title">Checkout cancelled</h1>
            <p>No worries—your card has not been charged. You can restart checkout at any time.</p>
          </header>
          <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ margin: 0 }}>Ready to try again? Head back to the credit shop to pick up where you left off.</p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/credit-shop" className="btn-primary">
              Return to credit shop
            </Link>
            <Link href="/dashboard" className="btn-secondary">
              Go to dashboard
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
