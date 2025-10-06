'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type CreditState = {
  credits: number | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string | null;
};

const DEAL_AMOUNT = 5;
const DEAL_PRICE = 3.99;

const currencyFormatter = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

export default function CreditShopPage() {
  const [state, setState] = useState<CreditState>({ credits: null, status: 'idle', message: null });

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

  const handlePurchase = async () => {
    setState((prev) => ({ ...prev, status: 'loading', message: null }));
    try {
      const res = await fetch('/api/user/credits/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: DEAL_AMOUNT }),
      });
      if (!res.ok) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          message: 'Unable to complete your purchase right now. Please try again shortly.',
        }));
        return;
      }
      const data = await res.json();
      const credits = typeof data?.credits === 'number' ? data.credits : prevCreditsAfterPurchase(state.credits, DEAL_AMOUNT);
      setState({
        credits,
        status: 'success',
        message: `Success! ${DEAL_AMOUNT} credits have been added to your account.`,
      });
    } catch {
      setState((prev) => ({
        ...prev,
        status: 'error',
        message: 'Unable to complete your purchase right now. Please try again shortly.',
      }));
    }
  };

  const buttonLabel = state.status === 'loading' ? 'Processing purchase…' : `Buy now for ${currencyFormatter.format(DEAL_PRICE)}`;

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
              <p style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#2563eb' }}>Today&apos;s deal</p>
              <h2 style={{ fontSize: '1.75rem', margin: 0 }}>
                {DEAL_AMOUNT} credits for {currencyFormatter.format(DEAL_PRICE)}
              </h2>
              <p style={{ margin: 0, fontSize: '1.125rem' }}>Top up instantly and keep writing.</p>
              <button
                type="button"
                className="btn-primary"
                onClick={handlePurchase}
                disabled={state.status === 'loading'}
                style={{ minWidth: 200 }}
              >
                {buttonLabel}
              </button>
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
