import ClosePageLink from '../../components/ClosePageLink';
import { createMetadata } from '../../lib/seo';

export const metadata = createMetadata({
  title: 'Contact MPWriter support',
  description: 'Reach the MPWriter team for billing help, accessibility requests, or privacy questions.',
  path: '/contact',
});

export default function ContactPage() {
  return (
    <main className="hero-section">
      <section className="card">
        <div className="container">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <ClosePageLink className="micro-link close-link" label="Close and return" fallbackHref="/" />
          </div>
          <h1 style={{ margin: 0 }}>Contact</h1>
          <p style={{ marginTop: 12, color: '#64748b' }}>
            Reach us anytime at{' '}
            <a className="micro-link" href="mailto:james@sshiftgpt.com">
              james@sshiftgpt.com
            </a>
            . We aim to respond within one working day, typically within 24 hours during weekdays.
          </p>
          <p style={{ marginTop: 12, color: '#64748b' }}>
            <strong>What we can help with:</strong> Billing and credit questions, technical support, feature requests,
            privacy and data inquiries, refund requests, and accessibility needs. For urgent issues affecting your ability
            to send a letter, we prioritise rapid response.
          </p>
          <p style={{ marginTop: 12, color: '#64748b' }}>
            <strong>Support hours:</strong> We monitor emails Monday–Friday, 9am–5pm GMT. Responses outside these hours
            may take longer, but we'll always acknowledge your message within one working day.
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
