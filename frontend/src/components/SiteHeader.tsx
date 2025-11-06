'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Avatar from './Avatar';

type User = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  credits?: number | null;
};

export default function SiteHeader() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', {
          cache: 'no-store',
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = (await res.json()) as User;
        if (!cancelled) {
          setUser(data);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAuthed = !!user?.id;
  const firstName = (user?.name || '')?.split(' ')[0] || user?.email || 'Account';

  return (
    <header className="site-header">
      <div className="container">
        <div className="brand">
          <Link href="/">
            <img src="/assets/header-title.png" alt="MPWriter" />
          </Link>
        </div>
        <nav className="nav">
          <Link href="/how-it-works" className="hide-mobile">How it works</Link>
          {isAuthed && (
            <>
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/myLetters">
                <span className="hide-mobile">My Letters</span>
                <span className="mobile-only">Letters</span>
              </Link>
            </>
          )}

          {!isAuthed ? (
            <a href="/api/auth/google?returnTo=/dashboard" className="google-btn" aria-label="Sign in with Google">
              <svg className="google-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" aria-hidden>
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.8 2.3 30.3 0 24 0 14.6 0 6.4 5.4 2.6 13.2l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-2.7-.4-3.9H24v8.1h12.8c-.3 2-1.7 5.1-4.9 7.2l7.6 5.9c4.5-4.1 7-10.1 7-17.3z"/>
                <path fill="#FBBC05" d="M10.5 28.3A14.4 14.4 0 0 1 9.7 24c0-1.5.3-3 .7-4.3l-7.9-6.1A24 24 0 0 0 0 24c0 3.8.9 7.4 2.6 10.4l7.9-6.1z"/>
                <path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.7l-7.6-5.9c-2.1 1.5-5 2.5-8.4 2.5-6.2 0-11.5-4.1-13.4-9.7l-7.9 6.1C6.4 42.6 14.6 48 24 48z"/>
                <path fill="none" d="M0 0h48v48H0z"/>
              </svg>
              <span className="google-btn-text">Sign in with Google</span>
            </a>
          ) : (
            <div className="profile-chip">
              <details className="profile-details">
                <summary className="profile-summary">
                  <Avatar 
                    src={user?.image ? `/api/auth/avatar/${user.id}` : undefined} 
                    alt={firstName} 
                    size={28} 
                  />
                  <span className="profile-name">{firstName}</span>
                </summary>
                <div className="profile-menu" role="menu">
                  <a role="menuitem" href="/api/auth/logout">Logout</a>
                </div>
              </details>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
