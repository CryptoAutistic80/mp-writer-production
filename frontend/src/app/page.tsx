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
    <div className="page-wrap">
      <header className="site-header">
        <div className="container">
          <div className="brand">MPWriter</div>
          <nav className="nav">
            <Link href="#features">Features</Link>
            <Link href="#how">How it works</Link>
            <Link href="#contact">Contact</Link>
          </nav>
        </div>
      </header>

      <main className="hero-section">
        <div className="bg-orbs" aria-hidden />

        <section className="card">
          <h1 className="hero-title">
            Your voice,
            <br />
            clearly heard.
          </h1>
          <p className="hero-sub">Craft researched, respectful letters to your MP in minutes.</p>
          <div className="cta">
            <GoogleButton />
            <p className="fineprint">
              Secure login with Google. We’ll never post or email without your consent.
            </p>
          </div>

          <div id="features" className="features">
            <div className="feature">
              <span className="icon" aria-hidden>📍</span>
              <div>
                <div className="feature-title">Look up your MP</div>
                <div className="feature-sub">Enter your postcode, we handle the rest.</div>
              </div>
            </div>
            <div className="feature">
              <span className="icon" aria-hidden>💬</span>
              <div>
                <div className="feature-title">Describe your issue</div>
                <div className="feature-sub">Tell us what matters to you.</div>
              </div>
            </div>
            <div className="feature">
              <span className="icon" aria-hidden>📝</span>
              <div>
                <div className="feature-title">Get your letter</div>
                <div className="feature-sub">AI crafts drafts with citations, ready to send.</div>
              </div>
            </div>

            <div className="phone-mock" aria-hidden>
              <div className="phone-screen">
                <div className="msg-line w60" />
                <div className="msg-line w90" />
                <div className="msg-line w85" />
                <div className="msg-line w70" />
                <div className="btn-ghost">Copy to clipboard</div>
              </div>
            </div>
          </div>

          <div className="copy">
            <p>
              For years, people have said: “write to your MP”. Most of us never did; MPWriter makes it effortless.
              Powered by AI research, you can send a perfectly articulated, evidence-based letter every time your
              voice needs to be heard.
            </p>
            <p className="emph">One credit = one research & draft. Buy only what you use.</p>
          </div>

          <div className="card-footer">
            <div className="brand-sub">MPWriter</div>
            <div className="links">
              <Link href="#privacy">Privacy</Link>
              <Link href="#terms">Terms</Link>
              <Link href="#contact">Contact</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <span>© {new Date().getFullYear()} MPWriter</span>
          <div className="links">
            <Link href="#privacy">Privacy</Link>
            <Link href="#terms">Terms</Link>
            <Link href="#contact">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
