export default function HowItWorksPage() {
  // AnimatedBackground is rendered globally in layout.tsx.
  return (
    <main className="hero-section">
      <section className="card hero-card">
        <div className="container">
          <h1 style={{ margin: 0 }}>How it works</h1>
          <p style={{ marginTop: 12, color: '#64748b' }}>
            Tell us your issue, answer a few clarifying questions, and we'll research
            the facts and compose a clear, respectful letter to your MP — complete with
            citable sources and a concrete request for action. Most letters are ready within 10–20 minutes,
            with full research, tone customisation, and export options available.
          </p>

          <div className="stepper" style={{ marginTop: 24 }}>
            {/* Step 1 */}
            <div className="step">
              <div className="step-icon" aria-hidden>1</div>
              <div>
                <div className="step-title">Share your issue</div>
                <div className="step-sub">
                  Tell us everything — this is your space to vent. Write as much detail as you like about
                  what’s happening and why it matters to you, from local services to national policy. Add any links or
                  background you have so we can hit the ground running. Prefer speaking? Tap the microphone button on any
                  input to record live and transcribe straight into the field — no file uploads needed.
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
                  The research process usually takes 10–15 minutes, and can take up to 20 minutes depending on the complexity
                  of your issue. You can track progress in real-time.
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
                  action you're seeking — making it straightforward for your MP's office to respond.
                  You can review and edit the draft in the Writing Desk, make multiple revisions,
                  and export when ready. At the end, you’ll have the option to save the letter to
                  your account for future reference. The most recent letter remains open in the
                  Writing Desk until you leave using the Exit button.
                </div>
              </div>
            </div>

            
          </div>

          <div className="value-callout" style={{ marginTop: 20 }}>
            <p className="value-1"><strong>What you get</strong></p>
            <p className="value-2">
              A well‑structured, fact‑checked letter with citations, ready to send.
              Each draft includes a summary, evidence links, and a clear call to action so a caseworker can act quickly.
              You can choose to save your letter to your account at the end so you can return to it later to edit or export.
              Export formats
              include PDF and DOCX for easy delivery to your MP's office via email or post.
            </p>
            <p className="value-3"><strong>One credit = one research & draft.</strong> Each credit covers the full research process,
            letter composition with your chosen tone, all revisions within the same session, and unlimited exports.
            Buy only what you use.</p>
          </div>

          <div className="copy" style={{ marginTop: 24 }}>
            <p className="emph">What you'll need</p>
            <ul style={{ marginTop: 8, paddingLeft: 20, color: '#64748b' }}>
              <li>Your UK postcode (for MP identification)</li>
              <li>A clear description of the issue or topic you want to raise</li>
              <li>Any supporting links, personal stories, or context you'd like to include</li>
              <li>Optional: use the mic button to dictate answers</li>
            </ul>
            <p style={{ marginTop: 12, color: '#64748b' }}>
              <strong>Average turnaround:</strong> Most letters are ready to review within 10–20 minutes from start to finish,
              depending on research complexity. You'll see progress updates throughout the process.
            </p>
          </div>

          <div className="copy">
            <p className="emph">Privacy & security</p>
            <p>
              Sign in with Google — we never post on your behalf. Your drafts and inputs stay in your account and are used only
              to create your letters. All data is encrypted at rest, and we maintain audit logging for security and compliance.
              We use rate limiting to protect our systems and your account, and we never share your information with third parties
              except as required to deliver the service (e.g., MP lookup services). Your letters and personal data remain private
              and are only accessible to you through your authenticated account.
            </p>
            <p style={{ marginTop: 12, color: '#64748b' }}>
              For details on data handling, retention, and your rights, see our{' '}
              <a className="micro-link" href="/privacy">Privacy Policy</a> and{' '}
              <a className="micro-link" href="/terms">Terms</a>.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
