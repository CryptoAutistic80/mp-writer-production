'use client';

import Link from 'next/link';
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

const TESTIMONIALS = [
  {
    quote:
      'MPWriter helped our tenants union contact our MP quickly with the right evidence. The briefing notes meant we could complain to government departments with confidence.',
    name: 'Amelia P., London housing campaigner',
  },
  {
    quote:
      'I finally contacted my MP about disabled access in our town centre. The tailored UK research saved me hours and kept the tone respectful.',
    name: 'Jon B., Greater Manchester constituent',
  },
  {
    quote:
      'As a community organiser, I need to write to MPs quickly and accurately. MPWriter’s citations and tone controls make it simple to brief supporters.',
    name: 'Priya K., Leeds civic volunteer',
  },
];

const PRESS_LOGOS = [
  { name: 'The Yorkshire Post', url: 'https://www.yorkshirepost.co.uk/' },
  { name: 'BBC Radio Sheffield', url: 'https://www.bbc.co.uk/sounds/play/live:bbc_radio_sheffield' },
  { name: 'Democracy Club', url: 'https://democracyclub.org.uk/' },
];

const TRUST_BADGES = [
  {
    title: 'Built for UK constituencies',
    description: 'Powered by official parliamentary boundaries and postcode lookup so every letter reaches the right MP.',
  },
  {
    title: 'Researched with UK sources',
    description: 'Each briefing links to trusted UK media, Parliament libraries, and watchdog reports for credible complaints to government.',
  },
  {
    title: 'Data-responsible',
    description: 'Secure Google sign-in and GDPR-ready storage keep constituent stories private and under your control.',
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
    <section className="card">
      <div className="hero-top">
        <div className="hero-copy">
          <h1 className="hero-title">
            Contact your MP quickly
            <br />
            <span className="hero-highlight">with confident research.</span>
          </h1>
          <p className="hero-sub">
            Craft researched, respectful letters that help you contact your MP, complain to the UK government, and write to representatives quickly. MPWriter pairs postcode lookup with deep AI research, tone personalisation, and easy export so your message lands with impact.
          </p>
          <div className="cta">
            <div className="hero-buttons" role="group" aria-label="Key actions">
              <Link className="btn-primary" href="#start-contact">
                Start contacting your MP
              </Link>
              <Link className="btn-secondary" href="#features">
                See how it works
              </Link>
            </div>
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

      <div id="start-contact" className="value-callout" role="note" aria-label="Key benefits">
        <p className="value-1"><strong>Most of us never write to our MP.</strong></p>
        <p className="value-2">
          For years, writing to your MP in the UK meant hours of digging for facts, drafting, and editing — so important issues often went unspoken. MPWriter changes that. Share what matters and we surface the evidence, shape the message, and help it land with impact, whether you are rallying support or lodging a formal complaint to a government department.
        </p>
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

      <section className="proof-sections" aria-label="MPWriter credibility">
        <div className="proof-block">
          <h2 className="proof-heading">Trusted by UK civic voices</h2>
          <ul className="testimonial-grid">
            {TESTIMONIALS.map((testimonial) => (
              <li key={testimonial.name} className="testimonial-card">
                <p className="testimonial-quote">“{testimonial.quote}”</p>
                <p className="testimonial-name">{testimonial.name}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="proof-block">
          <h2 className="proof-heading">Featured by UK democracy partners</h2>
          <ul className="press-logos" aria-label="Press coverage">
            {PRESS_LOGOS.map((press) => (
              <li key={press.name} className="press-logo">
                <a href={press.url} target="_blank" rel="noreferrer" aria-label={`Learn more about ${press.name}`}>
                  {press.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="proof-block">
          <h2 className="proof-heading">Confidence badges</h2>
          <ul className="trust-badges" aria-label="Trust badges">
            {TRUST_BADGES.map((badge) => (
              <li key={badge.title} className="trust-badge">
                <strong>{badge.title}</strong>
                <p>{badge.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

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
