'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type CreditState = {
  credits: number | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string | null;
  pendingCredits: number | null;
};

const DEALS = [
  { credits: 3, price: 2.99 },
  { credits: 5, price: 4.99 },
  { credits: 10, price: 9.99 },
];

const currencyFormatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export default function CreditShopPage() {
  const [state, setState] = useState<CreditState>({
    credits: null,
    status: 'idle',
    message: null,
    pendingCredits: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/user/credits', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data?.credits === 'number') {
          setState((prev) => ({ ...prev, credits: data.credits }));
        }
      } catch {
        // Ignore fetch errors silently, page will still allow purchase attempts.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePurchase = async (dealCredits: number) => {
    setState((prev) => ({
      ...prev,
      status: 'loading',
      message: null,
      pendingCredits: dealCredits,
    }));
    try {
      const res = await fetch('/api/user/credits/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: dealCredits }),
      });
      if (!res.ok) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          message: 'Unable to complete your purchase right now. Please try again shortly.',
          pendingCredits: null,
        }));
        return;
      }
      const data = await res.json();
      setState((prev) => {
        const credits =
          typeof data?.credits === 'number' ? data.credits : prevCreditsAfterPurchase(prev.credits, dealCredits);
        return {
          credits,
          status: 'success',
          message: `Success! ${dealCredits} credits have been added to your account.`,
          pendingCredits: null,
        };
      });
    } catch {
      setState((prev) => ({
        ...prev,
        status: 'error',
        message: 'Unable to complete your purchase right now. Please try again shortly.',
        pendingCredits: null,
      }));
    }
  };

  return (
    <main className="hero-section">
      <section className="card">
        <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <header>
            <h1 className="section-title">Credit shop</h1>
            <p>Purchase additional credits to continue crafting powerful letters to your MP.</p>
          </header>
          <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
              <p style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#2563eb' }}>
                Choose your top-up
              </p>
              <p style={{ margin: 0, fontSize: '1.125rem' }}>Pick the package that suits your writing needs.</p>
              <div
                style={{
                  display: 'grid',
                  gap: 16,
                  width: '100%',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                }}
              >
                {DEALS.map((deal) => {
                  const isProcessing = state.status === 'loading' && state.pendingCredits === deal.credits;
                  return (
                    <div
                      key={deal.credits}
                      className="card"
                      style={{ border: '1px solid #e2e8f0', background: '#fff', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}
                    >
                      <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{deal.credits} credits</h2>
                      <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                        {currencyFormatter.format(deal.price)}
                      </p>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => handlePurchase(deal.credits)}
                        disabled={state.status === 'loading'}
                        style={{ marginTop: 'auto' }}
                      >
                        {isProcessing ? 'Processing purchase…' : `Buy for ${currencyFormatter.format(deal.price)}`}
                      </button>
                    </div>
                  );
                })}
              </div>
              {state.message && (
                <p
                  role={state.status === 'error' ? 'alert' : undefined}
                  style={{
                    margin: 0,
                    color: state.status === 'error' ? '#b91c1c' : '#166534',
                    fontWeight: 500,
                  }}
                >
                  {state.message}
                </p>
              )}
              {typeof state.credits === 'number' && (
                <p style={{ margin: 0 }}>You now have {formatCredits(state.credits)} credits available.</p>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <Link href="/dashboard" className="btn-secondary">
              Exit shop
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function prevCreditsAfterPurchase(current: number | null, delta: number) {
  if (typeof current !== 'number') return delta;
  return Math.round((current + delta) * 100) / 100;
}

function formatCredits(value: number) {
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}
