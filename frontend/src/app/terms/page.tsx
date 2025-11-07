import ClosePageLink from '../../components/ClosePageLink';

export default function TermsPage() {
  return (
    <main className="hero-section">
      <section className="card hero-card">
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <ClosePageLink className="micro-link close-link" label="Close and return" fallbackHref="/" />
          </div>
          <h1 style={{ margin: 0 }}>Terms of Service</h1>
          <p style={{ marginTop: 12, color: '#64748b' }}>
            These terms govern your use of MPWriter. By using the service you agree to them. If you have questions, contact
            <a className="micro-link" href="mailto:james@sshiftgpt.com"> james@sshiftgpt.com</a>.
          </p>

          <div className="copy" style={{ marginTop: 16 }}>
            <p className="emph">Service</p>
            <p style={{ color: '#64748b' }}>
              MPWriter helps you research and draft letters to your MP. We aim for high availability but do not guarantee
              uninterrupted service. Features may change over time.
            </p>
          </div>

          <div className="copy">
            <p className="emph">Acceptable use</p>
            <ul style={{ marginTop: 8, paddingLeft: 20, color: '#64748b' }}>
              <li>No unlawful, harmful, or abusive content.</li>
              <li>Do not attempt to disrupt or misuse the service.</li>
              <li>Respect third‑party rights and applicable laws.</li>
            </ul>
          </div>

          <div className="copy">
            <p className="emph">Accounts and billing</p>
            <p style={{ color: '#64748b' }}>
              You are responsible for activity under your account. Credits are consumed when a research + draft session is
              completed. Refunds may be offered at our discretion in cases of technical failure.
            </p>
          </div>

          <div className="copy">
            <p className="emph">Content</p>
            <p style={{ color: '#64748b' }}>
              You retain rights to content you provide and the letters we generate for you. You grant us a limited licence
              to process the content solely to operate the service.
            </p>
          </div>

          <div className="copy">
            <p className="emph">Disclaimers</p>
            <p style={{ color: '#64748b' }}>
              The service is provided “as is” without warranties. We do not provide legal advice. You should verify cited
              sources and ensure letters meet your needs before sending.
            </p>
          </div>

          <div className="copy">
            <p className="emph">Liability</p>
            <p style={{ color: '#64748b' }}>
              To the extent permitted by law, our liability is limited to amounts you paid in the 12 months prior to a claim.
            </p>
          </div>

          <div className="copy">
            <p className="emph">Termination</p>
            <p style={{ color: '#64748b' }}>
              You can stop using the service at any time. We may suspend or terminate accounts that violate these terms or
              pose security risks.
            </p>
          </div>

          <div className="copy" style={{ color: '#64748b' }}>
            <p style={{ marginTop: 12 }}>Provider: Singularity Shift Ltd, United Kingdom.</p>
            <p style={{ marginTop: 6, fontSize: 14 }}>Last updated: 2025-01-01</p>
          </div>
        </div>
      </section>
    </main>
  );
}
