export default function Hero() {
  return (
    <section className="card">
      <div className="hero-top">
        <div className="hero-copy">
          <h1 className="hero-title">
            Your voice,
            <br />
            <span className="hero-highlight">clearly heard.</span>
          </h1>
          <p className="hero-sub">Craft researched, respectful letters to your MP in minutes.</p>
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
        <p className="value-2">For years, writing to your MP meant hours of digging for facts, drafting, and editing — so important issues often went unspoken. MP Writer changes that. We pair AI-powered research with a clear drafting flow so you can deliver a persuasive, evidence-backed letter in minutes. Share what matters and we’ll surface the facts, shape the message, and help it land with impact.</p>
        <p className="value-3"><strong>One credit = One letter.</strong></p>
      </div>

      <div id="features" className="stepper">
        {/* Step 1 */}
        <div className="step">
          <div className="step-icon" aria-hidden>1</div>
          <div>
            <div className="step-title">Look up your MP</div>
            <div className="step-sub">Enter your postcode and we’ll identify your constituency MP.</div>
          </div>
        </div>
        {/* Step 2 */}
        <div className="step">
          <div className="step-icon" aria-hidden>2</div>
          <div>
            <div className="step-title">Describe your issue</div>
            <div className="step-sub">Tell us what you want to raise and share any helpful context.</div>
          </div>
        </div>
        {/* Step 3 */}
        <div className="step">
          <div className="step-icon" aria-hidden>3</div>
          <div>
            <div className="step-title">Select your tone</div>
            <div className="step-sub">Choose from formal, empathetic, urgent, and other tones.</div>
          </div>
        </div>
        {/* Step 4 */}
        <div className="step">
          <div className="step-icon" aria-hidden>4</div>
          <div>
            <div className="step-title">Get your letter</div>
            <div className="step-sub">Receive a polished draft with citations and a clear ask.</div>
          </div>
        </div>
        {/* Step 5 */}
        <div className="step">
          <div className="step-icon" aria-hidden>5</div>
          <div>
            <div className="step-title">Upload supporting documents (coming soon)</div>
            <div className="step-sub">Attach background papers to guide the research once this launches.</div>
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
    </section>
  );
}
