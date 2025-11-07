import ClosePageLink from '../../components/ClosePageLink';
import { createMetadata } from '../../lib/seo';

export const metadata = createMetadata({
  title: 'Privacy Policy',
  description: 'Learn how MPWriter collects, stores, and protects your account data, drafts, and payment history.',
  path: '/privacy',
});

export default function PrivacyPolicyPage() {
  return (
    <main className="hero-section">
      <section className="card">
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <ClosePageLink className="micro-link close-link" label="Close and return" fallbackHref="/" />
          </div>
          <h1 style={{ margin: 0 }}>Privacy Policy</h1>
          <p style={{ marginTop: 12, color: '#64748b' }}>
            This policy explains how MPWriter (operated by Singularity Shift Ltd) collects, uses, and protects your
            information. If you have any questions, contact us at{' '}
            <a className="micro-link" href="mailto:james@sshiftgpt.com">james@sshiftgpt.com</a>.
          </p>

          <div className="copy" style={{ marginTop: 16 }}>
            <p className="emph">What we collect</p>
            <ul style={{ marginTop: 8, paddingLeft: 20, color: '#64748b' }}>
              <li>Account info from Google Sign‑In (name, email, profile image).</li>
              <li>Content you provide to generate letters (prompts, drafts, notes).</li>
              <li>Operational data for security and performance (IP, device, logs).</li>
            </ul>
          </div>

          <div className="copy">
            <p className="emph">How we use data</p>
            <ul style={{ marginTop: 8, paddingLeft: 20, color: '#64748b' }}>
              <li>Provide the service: research, draft, and save your letters.</li>
              <li>Improve reliability and security, including abuse and fraud prevention.</li>
              <li>Respond to support queries and manage your account or billing.</li>
            </ul>
          </div>

          <div className="copy">
            <p className="emph">Sharing</p>
            <p style={{ color: '#64748b' }}>
              We do not sell your data. We share only with trusted providers necessary to deliver the service (for
              example, authentication and MP lookup APIs) under appropriate data protection agreements, or when
              required by law.
            </p>
          </div>

          <div className="copy">
            <p className="emph">Security</p>
            <p style={{ color: '#64748b' }}>
              Data is encrypted at rest and in transit. We use audit logging and rate limiting to protect accounts and
              systems. Access to production data is strictly limited and monitored.
            </p>
          </div>

          <div className="copy">
            <p className="emph">Retention</p>
            <p style={{ color: '#64748b' }}>
              Letter drafts remain in your account until you delete them. Operational logs are retained for a limited
              period for security and troubleshooting, then deleted or anonymised.
            </p>
          </div>

          <div className="copy">
            <p className="emph">Your rights</p>
            <p style={{ color: '#64748b' }}>
              You can request access, correction, deletion, or export of your personal data. Contact
              <a className="micro-link" href="mailto:james@sshiftgpt.com"> james@sshiftgpt.com</a> to make a request.
            </p>
          </div>

          <div className="copy" style={{ color: '#64748b' }}>
            <p style={{ marginTop: 12 }}>Controller: Singularity Shift Ltd, United Kingdom.</p>
            <p style={{ marginTop: 6, fontSize: 14 }}>Last updated: 2025-01-01</p>
          </div>
        </div>
      </section>
    </main>
  );
}
