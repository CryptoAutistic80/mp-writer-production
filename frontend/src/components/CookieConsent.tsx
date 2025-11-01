'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mpwriter-cookie-consent';

export default function CookieConsent() {
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const existingConsent = window.localStorage.getItem(STORAGE_KEY);
    if (!existingConsent) {
      setShouldRender(true);
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const body = document.body;
    const pageWrap = document.querySelector('.page-wrap') as HTMLElement | null;
    if (shouldRender) {
      body.classList.add('cookie-consent-pending');
      pageWrap?.setAttribute('aria-hidden', 'true');
      pageWrap?.setAttribute('inert', '');
    } else {
      body.classList.remove('cookie-consent-pending');
      pageWrap?.removeAttribute('aria-hidden');
      pageWrap?.removeAttribute('inert');
    }
    return () => {
      body.classList.remove('cookie-consent-pending');
      pageWrap?.removeAttribute('aria-hidden');
      pageWrap?.removeAttribute('inert');
    };
  }, [shouldRender]);

  const handleAccept = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, 'essential');
    }
    setShouldRender(false);
  };

  if (!shouldRender) {
    return null;
  }

  return (
    <>
      <div className="cookie-consent__overlay" aria-hidden="true" />
      <div
        className="cookie-consent"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-consent-title"
        aria-describedby="cookie-consent-description"
      >
        <div className="cookie-consent__content">
          <h2 id="cookie-consent-title" className="cookie-consent__title">
            Cookies and privacy
          </h2>
          <p id="cookie-consent-description" className="cookie-consent__copy">
            We only use essential cookies to keep MPWriter secure, deliver core features, and
            remember your session. They do not track you across other sites, we never use them for
            advertising, and we do not trade or sell your data.
          </p>
          <div className="cookie-consent__actions">
            <Link href="/privacy" className="cookie-consent__link">
              Read our privacy policy
            </Link>
            <button
              type="button"
              className="btn-primary cookie-consent__button"
              onClick={handleAccept}
            >
              Accept essential cookies
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
