'use client';

import { useState } from 'react';
import type { AssetSlug } from '../content/blog/types';

export type EmailGatedDownloadProps = {
  assetSlug: AssetSlug;
  title: string;
  description: string;
};

type ApiResponse = {
  ok: boolean;
  message?: string;
  downloadPath?: string;
};

export default function EmailGatedDownload({ assetSlug, title, description }: EmailGatedDownloadProps) {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [downloadPath, setDownloadPath] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === 'submitting') return;

    setError(null);

    if (!email.trim()) {
      setError('Enter your email so we can send the template and log it to the CRM.');
      return;
    }

    if (!consent) {
      setError('Tick the consent box so we can email you the asset and onboarding tips.');
      return;
    }

    setStatus('submitting');

    try {
      const response = await fetch('/api/content-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), assetSlug }),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok || !data.downloadPath) {
        throw new Error(data.message || 'We could not capture your email. Try again or contact support.');
      }

      setDownloadPath(data.downloadPath);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <section className="blog-gated-download" aria-live="polite">
      <h3>{title}</h3>
      <p style={{ color: '#475569', marginTop: 4 }}>{description}</p>

      {status !== 'success' ? (
        <form className="gated-form" onSubmit={onSubmit}>
          <label className="gated-label" htmlFor={`${assetSlug}-email`}>
            Work or personal email
          </label>
          <input
            id={`${assetSlug}-email`}
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <label className="gated-consent">
            <input
              type="checkbox"
              name="consent"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              I agree to receive the asset link and occasional MPWriter onboarding emails. You can unsubscribe at any time.
            </span>
          </label>

          {error && (
            <p role="alert" className="gated-error">
              {error}
            </p>
          )}

          <button type="submit" className="google-btn" disabled={status === 'submitting'}>
            {status === 'submitting' ? 'Sending…' : 'Email me the template'}
          </button>
        </form>
      ) : (
        <div className="gated-success">
          <p>Thanks! We\'ve emailed you the asset and logged the workflow.</p>
          <a className="micro-link" href={downloadPath ?? '#'} download>
            Download now
          </a>
        </div>
      )}
    </section>
  );
}
