export default function HowItWorksPage() {
  // AnimatedBackground is rendered globally in layout.tsx.
  return (
    <main className="hero-section">
      <section className="card">
        <div className="container">
          <h1 style={{ margin: 0 }}>How it works</h1>
          <p style={{ marginTop: 12, color: '#64748b' }}>
            Tell us your issue, answer a few clarifying questions, and we’ll research
            the facts and compose a clear, respectful letter to your MP — complete with
            citable sources and a concrete request for action. Most letters are ready in minutes.
          </p>

          <div className="stepper" style={{ marginTop: 24 }}>
            {/* Step 1 */}
            <div className="step">
              <div className="step-icon" aria-hidden>1</div>
              <div>
                <div className="step-title">Share your issue</div>
                <div className="step-sub">
                  In a couple of sentences, explain what you want to raise —
                  anything from local services to national policy. Add any links or
                  background you already have so we can hit the ground running.
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="step">
              <div className="step-icon" aria-hidden>2</div>
              <div>
                <div className="step-title">Answer follow‑up questions</div>
                <div className="step-sub">
                  We’ll ask a few focused prompts (usually 2–4) to capture the key
                  details: who’s affected, what’s happening, why it matters to you,
                  and the action you want. Clear answers here make the letter specific and effective.
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="step">
              <div className="step-icon" aria-hidden>3</div>
              <div>
                <div className="step-title">Research with citable sources</div>
                <div className="step-sub">
                  Using state‑of‑the‑art AI, we scan reputable sources for supporting
                  facts and figures. We prioritise official publications and trusted
                  outlets — and we include the citations so your MP can verify the evidence quickly.
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="step">
              <div className="step-icon" aria-hidden>4</div>
              <div>
                <div className="step-title">Compose your letter</div>
                <div className="step-sub">
                  We draft a concise, respectful letter in your chosen tone. It explains
                  the issue, summarises the evidence, and clearly states the resolution or
                  action you’re seeking — making it straightforward for your MP’s office to respond.
                </div>
              </div>
            </div>

            
          </div>

          <div className="value-callout" style={{ marginTop: 20 }}>
            <p className="value-1"><strong>What you get</strong></p>
            <p className="value-2">
              A well‑structured, fact‑checked letter with citations, ready to send.
              Each draft includes a summary, evidence links, and a clear call to action so a caseworker can act quickly.
            </p>
            <p className="value-3"><strong>One credit = one research & draft.</strong> Buy only what you use.</p>
          </div>

          <div className="copy">
            <p className="emph">Privacy & security</p>
            <p>
              Sign in with Google — we never post on your behalf. Your drafts and inputs stay in your account and are used only
              to create your letters.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
