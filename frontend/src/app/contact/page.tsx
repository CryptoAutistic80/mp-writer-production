export default function ContactPage() {
  return (
    <main className="hero-section">
      <section className="card">
        <div className="container">
          <h1 style={{ margin: 0 }}>Contact</h1>
          <p style={{ marginTop: 12, color: '#64748b' }}>
            Reach us anytime at{' '}
            <a className="micro-link" href="mailto:james@sshiftgpt.com">
              james@sshiftgpt.com
            </a>
            .
          </p>

          <div style={{ marginTop: 24 }}>
            <img
              src="/assets/contact-image.png"
              alt="Contact MPWriter"
              style={{ display: 'block', width: '100%', height: 'auto', borderRadius: 12 }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

