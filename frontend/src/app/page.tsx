import Link from 'next/link';

const GoogleIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 48 48"
    aria-hidden
  >
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917z"/>
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 18.961 14 24 14c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.198l-6.191-5.238C29.127 35.091 26.66 36 24 36c-5.204 0-9.62-3.317-11.281-7.946l-6.53 5.027C9.5 39.556 16.227 44 24 44z"/>
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.03 12.03 0 0 1-4.095 5.564l.003-.002 6.191 5.238C36.938 40.205 44 36 44 24c0-1.341-.138-2.651-.389-3.917z"/>
  </svg>
);

function GoogleButton() {
  return (
    <a href="/api/auth/google" className="google-btn" aria-label="Continue with Google">
      <span className="google-icon" aria-hidden>
        <GoogleIcon />
      </span>
      <span>Continue with Google</span>
    </a>
  );
}

export default function Index() {
  return (
    <div>
      <main className="hero-section">

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
                <p className="fineprint">
                  Secure login with Google. We’ll never post or email without your consent.
                </p>
                <GoogleButton />
              </div>
            </div>
            <div className="hero-graphic" aria-hidden>
              <img src="/assets/hero-graphic.png" alt="" />
            </div>
          </div>

          <div className="value-callout" role="note" aria-label="Key benefits">
            <p className="value-1"><strong>Most of us never write to our MP.</strong></p>
            <p className="value-2">For years, writing to your MP meant long hours researching, drafting, and editing — often leaving important issues unspoken. MPWriter changes that. By combining AI-powered research with clear, structured drafting, it gives you the ability to share perfectly articulated, evidence-based letters in minutes. All you need to do is tell us what matters to you — we’ll handle the heavy lifting, so your voice reaches Parliament with clarity and impact.</p>
            <p className="value-3"><strong>One credit = one research & draft.</strong> Buy only what you use.</p>
          </div>

          <div id="features" className="stepper">
            {/* Step 1 */}
            <div className="step">
              <div className="step-icon" aria-hidden>1</div>
              <div>
                <div className="step-title">Look up your MP</div>
                <div className="step-sub">We'll find your MP for you from your address.</div>
              </div>
            </div>
            {/* Step 2 */}
            <div className="step">
              <div className="step-icon" aria-hidden>2</div>
              <div>
                <div className="step-title">Describe your issue</div>
                <div className="step-sub">Tell us what matters to you.</div>
              </div>
            </div>
            {/* Step 3 */}
            <div className="step">
              <div className="step-icon" aria-hidden>3</div>
              <div>
                <div className="step-title">Select your tone</div>
                <div className="step-sub">Choose a tone that fits your message.</div>
              </div>
            </div>
            {/* Step 4 */}
            <div className="step">
              <div className="step-icon" aria-hidden>4</div>
              <div>
                <div className="step-title">Get your letter</div>
                <div className="step-sub">AI crafts drafts with citations, ready to send.</div>
              </div>
            </div>
            {/* Step 5 */}
            <div className="step">
              <div className="step-icon" aria-hidden>5</div>
              <div>
                <div className="step-title">Email letters directly (coming soon)</div>
                <div className="step-sub">Send to your MP without leaving MP writer.</div>
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
      </main>
    </div>
  );
}
