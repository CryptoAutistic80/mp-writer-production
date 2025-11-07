'use client';

import { useEffect, useState } from 'react';

const PRICING_PACKAGES = [
  {
    name: 'Beginner Pack',
    credits: '3 credits',
    price: '£6.99',
    copy: 'Perfect if you want to try MPWriter or have a single issue to raise.'
  },
  {
    name: 'Novice Pack',
    credits: '6 credits',
    price: '£12.49',
    copy: 'Great for regular writers or when you expect follow-up letters.'
  },
  {
    name: 'Pro Scribe Pack',
    credits: '12 credits',
    price: '£21.99',
    copy: 'Best value when you’re advocating on multiple fronts or coordinating a campaign.'
  },
];

export default function Hero() {
  const [isPricingOpen, setPricingOpen] = useState(false);

  useEffect(() => {
    if (!isPricingOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPricingOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPricingOpen]);

  return (
    <section className="card hero-card">
      <div className="hero-top">
        <div className="hero-copy">
          <h1 className="hero-title">
            Your voice,
            <br />
            <span className="hero-highlight">clearly heard.</span>
          </h1>
          <p className="hero-sub">Craft researched, respectful letters to your MP in minutes. We handle postcode lookup, deep AI research with citations, tone personalisation, and make it easy to edit and export. You can choose to save your letter at the end for later.</p>
          <div className="cta">
            <p className="fineprint mobile-only">
              <a className="micro-link" href="/how-it-works">How it works</a>
            </p>
            <p className="fineprint">Sign in securely with Google — we use it only to verify you.</p>
          </div>
        </div>
        <div className="hero-graphic" aria-hidden>
          <img src="/assets/hero-graphic.png" alt="" />
        </div>
      </div>

      <div className="value-callout" role="note" aria-label="Key benefits">
        <p className="value-1"><strong>Most of us never write to our MP.</strong></p>
        <p className="value-2">For years, writing to your MP meant hours of digging for facts, drafting, and editing — so important issues often went unspoken. MP Writer changes that. We pair AI-powered research with a clear drafting flow so you can deliver a persuasive, evidence-backed letter in minutes. Share what matters and we'll surface the facts, shape the message, and help it land with impact.</p>
        <p className="value-3">
          <strong>One credit = One letter.</strong> Credit packs from £6.99.{' '}
          <button
            type="button"
            className="link-button micro-link"
            onClick={() => setPricingOpen(true)}
          >
            See full pricing →
          </button>
        </p>
      </div>

      <div id="features" className="stepper">
        {/* Stage 1: Plan */}
        <div className="step">
          <div className="step-icon" aria-hidden>1</div>
          <div>
            <div className="step-title">Plan</div>
            <div className="step-sub">Enter your postcode to find your MP and describe your issue. Share links, personal stories, or context — we'll use it to guide the research.</div>
          </div>
        </div>
        {/* Stage 2: Draft */}
        <div className="step">
          <div className="step-icon" aria-hidden>2</div>
          <div>
            <div className="step-title">Draft</div>
            <div className="step-sub">Answer a few follow-up questions, then watch as AI performs deep research with citable sources. Select your tone (formal, empathetic, urgent, and more) while your letter is being crafted with citations and a clear call to action.</div>
          </div>
        </div>
        {/* Stage 3: Deliver */}
        <div className="step">
          <div className="step-icon" aria-hidden>3</div>
          <div>
            <div className="step-title">Deliver</div>
            <div className="step-sub">Review your polished letter in the Writing Desk. Edit and export as PDF or DOCX. At the end, you can choose to save the letter to your account for later — the last letter stays open until you exit.</div>
          </div>
        </div>

        {/* Phone preview */}
        <div className="phone-mock" aria-hidden>
          <div className="phone-screen">
            <p><strong>Dear [MP Name],</strong></p>
            <p>I’m writing to express my concerns about an issue affecting our community.</p>
            <p>As a resident of [constituency], I believe it’s vital that we address this together.</p>
            <p>AI‑powered research has helped me gather relevant facts and citations.</p>
            <div className="btn-ghost">Copy to clipboard</div>
          </div>
        </div>
      </div>
      <div className="copy" />

      <div className="card-footer">
        <div className="brand-sub"><img src="/assets/header-title.png" alt="MPWriter" /></div>
      </div>
      {isPricingOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pricing-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            zIndex: 1100,
          }}
          onClick={() => setPricingOpen(false)}
        >
          <div
            style={{
              maxWidth: 520,
              width: '100%',
              background: '#fff',
              borderRadius: 20,
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.25)',
              padding: '28px 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: 20,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div>
                <h2 id="pricing-modal-title" style={{ margin: 0, fontSize: '1.75rem' }}>Full pricing</h2>
                <p style={{ margin: '8px 0 0', color: '#475569' }}>
                  Credits cover deep research with citations, letter drafting in your chosen tone, unlimited in-session edits,
                  and exports (PDF/DOCX). Sign in to purchase securely inside the Writing Desk.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPricingOpen(false)}
                className="modal-close-button"
                aria-label="Close pricing"
              >
                ×
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {PRICING_PACKAGES.map((pkg) => (
                <div
                  key={pkg.name}
                  className="card"
                  style={{
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    padding: 16,
                    borderRadius: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem' }}>{pkg.name}</h3>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{pkg.price}</span>
                  </div>
                  <p style={{ margin: 0, fontWeight: 600, color: '#1e3a8a' }}>{pkg.credits}</p>
                  <p style={{ margin: 0, color: '#475569', lineHeight: 1.5 }}>{pkg.copy}</p>
                </div>
              ))}
            </div>
            <p style={{ margin: 0, color: '#475569', fontSize: '0.95rem' }}>
              Use credits only when you choose to run research. They never expire, and refunds are available if something goes wrong — just <a className="micro-link" href="/contact">contact us</a>.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setPricingOpen(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
