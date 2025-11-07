'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiClient } from '../../lib/api-client';

type CreditState = {
  credits: number | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string | null;
  pendingCredits: number | null;
};

type CreditPackage = {
  credits: number;
  priceId: string;
  amount: number;
  currency: string;
};

const STRIPE_CHECKOUT_ENABLED = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED !== '0' && 
                                 process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED !== 'false';

// Fallback packages if backend is unavailable
const FALLBACK_PACKAGES: CreditPackage[] = [
  { credits: 3, priceId: '', amount: 699, currency: 'gbp' },
  { credits: 6, priceId: '', amount: 1249, currency: 'gbp' },
  { credits: 12, priceId: '', amount: 2199, currency: 'gbp' },
];

const PACKAGE_COPY: Record<number, { name: string; subtitle: string }> = {
  3: { name: 'Beginner Pack', subtitle: '3 credits to get you started' },
  6: { name: 'Novice Pack', subtitle: '6 credits for regular writers' },
  12: { name: 'Pro Scribe Pack', subtitle: '12 credits — best value' },
};

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { 
    style: 'currency', 
    currency: currency.toUpperCase() 
  }).format(amount / 100); // Amount is in minor units
}

function formatCreditQuantity(credits: number) {
  return `${credits} credit${credits === 1 ? '' : 's'}`;
}

export default function CreditShopClient() {
  const [state, setState] = useState<CreditState>({
    credits: null,
    status: 'idle',
    message: null,
    pendingCredits: null,
  });
  const [packages, setPackages] = useState<CreditPackage[]>(FALLBACK_PACKAGES);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Fetch available packages from backend
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.get('/api/checkout/packages');
        if (!cancelled && Array.isArray(data) && data.length > 0) {
          setPackages(data);
        }
      } catch (error) {
        console.error('Failed to fetch credit packages:', error);
      } finally {
        if (!cancelled) {
          setPackagesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch current credit balance
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.get('/api/user/credits');
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 600px)');
    const handleChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsMobile(event.matches);
    };

    handleChange(mediaQuery);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }

    mediaQuery.addListener(handleChange);
    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  const handlePurchase = async (dealCredits: number) => {
    setState((prev) => ({
      ...prev,
      status: 'loading',
      message: STRIPE_CHECKOUT_ENABLED ? 'Redirecting you to our secure checkout…' : null,
      pendingCredits: dealCredits,
    }));
    try {
      if (STRIPE_CHECKOUT_ENABLED) {
        const data = await apiClient.post('/api/checkout/session', { credits: dealCredits });
        const url = typeof data?.url === 'string' ? data.url : null;
        if (!url) throw new Error('Checkout session response missing redirect URL');
        window.location.assign(url);
        return;
      }

      const data = await apiClient.post('/api/user/credits/add', { amount: dealCredits });
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
    } catch (error) {
      console.error('Unable to process credit purchase', error);
      setState((prev) => ({
        ...prev,
        status: 'error',
        message: STRIPE_CHECKOUT_ENABLED
          ? 'Unable to start checkout. Please try again shortly.'
          : 'Unable to complete your purchase right now. Please try again shortly.',
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
            <p style={{ marginTop: 8, color: '#64748b' }}>
              Each credit includes: full AI-powered research with citations, letter composition in your chosen tone,
              unlimited revisions within the same session, and unlimited exports (PDF/DOCX). Credits never expire and
              you only pay for what you use.
            </p>
          </header>
          <div className="card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
              <p style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, color: '#2563eb' }}>
                Choose your top-up
              </p>
              <p style={{ margin: 0, fontSize: '1.125rem' }}>Pick the package that suits your writing needs.</p>
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9375rem' }}>
                <strong>New to MP Writer?</strong> Start with 3 credits to try the service. Regular advocates may prefer 6 credits.
                Campaigners and those with multiple issues often choose 12 credits for the best value per letter.
              </p>
              {packagesLoading ? (
                <p style={{ margin: 0, color: '#64748b' }}>Loading packages...</p>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gap: 16,
                    width: '100%',
                    justifyItems: 'center',
                    gridTemplateColumns: isMobile
                      ? '1fr'
                      : 'repeat(auto-fit, minmax(220px, 1fr))',
                  }}
                >
                  {packages.map((pkg) => {
                    const isProcessing = state.status === 'loading' && state.pendingCredits === pkg.credits;
                    const processingLabel = STRIPE_CHECKOUT_ENABLED ? 'Redirecting to checkout…' : 'Processing purchase…';
                    const packageCopy = PACKAGE_COPY[pkg.credits];
                    const defaultName = `${pkg.credits}-credit pack`;
                    const displayName = packageCopy?.name ?? defaultName;
                    const subtitle = packageCopy?.subtitle ?? formatCreditQuantity(pkg.credits);
                    const priceLabel = formatPrice(pkg.amount, pkg.currency);
                    return (
                      <div
                        key={pkg.credits}
                        className="card"
                        style={{
                          border: '1px solid #e2e8f0',
                          background: '#fff',
                          padding: isMobile ? 12 : 16,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 12,
                          width: '100%',
                          maxWidth: 320,
                        }}
                      >
                        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>{displayName}</h2>
                        <p style={{ margin: 0, color: '#475569' }}>{subtitle}</p>
                        <p style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
                          {priceLabel}
                        </p>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={() => handlePurchase(pkg.credits)}
                          disabled={state.status === 'loading'}
                          style={{ marginTop: 'auto' }}
                        >
                          {isProcessing ? processingLabel : `Buy for ${priceLabel}`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              {STRIPE_CHECKOUT_ENABLED && (
                <>
                  <p style={{ margin: 0, color: '#475569', fontSize: '0.875rem' }}>
                    <strong>Secure checkout:</strong> Payments are processed securely by Stripe. All transactions are encrypted
                    and we accept major credit and debit cards. You'll receive a receipt via email for your records, and VAT invoices
                    are available for business accounts upon request.
                  </p>
                  <p style={{ margin: 0, color: '#475569', fontSize: '0.875rem', marginTop: 8 }}>
                    <strong>After purchase:</strong> Credits are added immediately to your account after successful payment. You can
                    start drafting letters right away. If you have any questions about credits, billing, or refunds, please{' '}
                    <a className="micro-link" href="/contact">contact us</a>.
                  </p>
                </>
              )}
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
