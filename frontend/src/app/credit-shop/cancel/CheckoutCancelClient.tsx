'use client';

import Link from 'next/link';

export default function CheckoutCancelClient() {
  return (
    <main className="hero-section">
      <section className="card">
        <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <header>
            <h1 className="section-title">Checkout cancelled</h1>
            <p>Your payment was not processed.</p>
          </header>
          <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ margin: 0, color: '#475569' }}>
                You cancelled the checkout process. No charges were made to your account.
              </p>
              <p style={{ margin: 0, color: '#475569' }}>
                If you experienced any issues or have questions, please contact our support team.
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/credit-shop" className="btn-primary">
              Try again
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
