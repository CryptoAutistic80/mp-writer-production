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
            citable sources and a concrete request for action.
          </p>

          <div className="stepper" style={{ marginTop: 24 }}>
            {/* Step 1 */}
            <div className="step">
              <div className="step-icon" aria-hidden>1</div>
              <div>
                <div className="step-title">Share your issue</div>
                <div className="step-sub">
                  In a sentence or two, describe what you want to write about —
                  anything from local services to national policy. If you already
                  have context or a link, include it.
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="step">
              <div className="step-icon" aria-hidden>2</div>
              <div>
                <div className="step-title">Answer follow‑up questions</div>
                <div className="step-sub">
                  We’ll ask a few focused questions (2–4) to nail down the key
                  details: who’s affected, what’s happening, why it matters to you,
                  and the outcome you want. This keeps your message specific and effective.
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="step">
              <div className="step-icon" aria-hidden>3</div>
              <div>
                <div className="step-title">Research with citable sources</div>
                <div className="step-sub">
                  Using state‑of‑the‑art AI, we scan reputable sources to surface
                  relevant facts and figures. We prioritise official publications and
                  trusted outlets — and we include the citations so your MP can verify
                  the evidence.
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
                  action you’re seeking — making it easy for your MP’s office to respond.
                </div>
              </div>
            </div>

            
          </div>

          <div className="value-callout" style={{ marginTop: 20 }}>
            <p className="value-1"><strong>What you get</strong></p>
            <p className="value-2">
              A well‑structured, fact‑checked letter with citations, ready to send.
              It’s designed to be clear, constructive, and easy for a caseworker to action.
            </p>
            <p className="value-3"><strong>One credit = one research & draft.</strong> Buy only what you use.</p>
          </div>

          <div className="copy">
            <p className="emph">Privacy & security</p>
            <p>
              Sign‑in is via Google; we don’t post anywhere on your behalf. Your
              drafts and inputs are used only to create your letter.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
