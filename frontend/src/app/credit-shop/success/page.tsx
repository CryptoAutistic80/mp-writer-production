'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

type ConfirmationState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  balance?: number | null;
  creditsAdded?: number;
  alreadyProcessed?: boolean;
};

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [state, setState] = useState<ConfirmationState>(() => {
    if (!sessionId) {
      return {
        status: 'error',
        message: 'We could not locate your checkout session. If you completed a payment, please contact support.',
      };
    }
    return { status: 'loading', message: 'Confirming your payment…' };
  });

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const confirm = async () => {
      setState({ status: 'loading', message: 'Confirming your payment…' });
      try {
        const res = await fetch('/api/checkout/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        if (!res.ok) throw new Error('Unable to confirm checkout session');
        const data = await res.json();
        if (cancelled) return;
        setState({
          status: 'success',
          message: data?.alreadyProcessed
            ? 'This purchase has already been applied to your account.'
            : 'Payment confirmed! Your credits are ready to use.',
          balance: typeof data?.balance === 'number' ? data.balance : undefined,
          creditsAdded: typeof data?.creditsAdded === 'number' ? data.creditsAdded : undefined,
          alreadyProcessed: Boolean(data?.alreadyProcessed),
        });
      } catch (error) {
        if (cancelled) return;
        console.error('Stripe checkout confirmation failed', error);
        setState({
          status: 'error',
          message: 'We could not confirm your payment. Please try again or contact support if the charge appears in your statement.',
        });
      }
    };

    confirm();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const creditsAdded = state.creditsAdded ?? null;
  const balance = state.balance ?? null;

  return (
    <main className="hero-section">
      <section className="card">
        <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <header>
            <h1 className="section-title">Payment complete</h1>
            <p>Thank you for supporting our mission to make letter writing easy.</p>
          </header>
          <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
              {state.status === 'success' && creditsAdded !== null && creditsAdded > 0 && (
                <p style={{ margin: 0 }}>We added {formatCredits(creditsAdded)} credits to your account.</p>
              )}
              {state.status === 'success' && typeof balance === 'number' && (
                <p style={{ margin: 0 }}>You now have {formatCredits(balance)} credits available.</p>
              )}
              {state.status === 'loading' && (
                <p style={{ margin: 0, color: '#0f172a' }}>This normally takes a couple of seconds. Thanks for your patience!</p>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/dashboard" className="btn-primary">
              Go to dashboard
            </Link>
            <Link href="/credit-shop" className="btn-secondary">
              Back to credit shop
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function formatCredits(value: number) {
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

