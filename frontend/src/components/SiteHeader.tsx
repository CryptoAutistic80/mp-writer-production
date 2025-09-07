import Link from 'next/link';
import { headers } from 'next/headers';

type User = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
};

async function getCurrentUser(): Promise<User | null> {
  // Forward incoming cookies to the backend via Next.js rewrite
  const hdrs = await headers();
  const cookie = hdrs.get('cookie') ?? '';
  try {
    const res = await fetch('/api/auth/me', {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as User;
  } catch {
    return null;
  }
}

export default async function SiteHeader() {
  const user = await getCurrentUser();
  const isAuthed = !!user?.id;

  return (
    <header className="site-header">
      <div className="container">
        <div className="brand">
          <Link href="/">
            <img src="/assets/header-title.png" alt="MPWriter" />
          </Link>
        </div>
        <nav className="nav">
          <Link href="/how-it-works">How it works</Link>
          <Link href="/contact">Contact</Link>

          {!isAuthed ? (
            <a href="/api/auth/google" className="header-login" aria-label="Sign in with Google">
              <span className="gdot" aria-hidden />
              <span>Sign in</span>
            </a>
          ) : (
            <div className="profile" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <details>
                <summary style={{ listStyle: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  {user?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt={user.name || user.email || 'Profile'} width={28} height={28} style={{ borderRadius: '999px' }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: '999px', background: '#ddd' }} aria-hidden />
                  )}
                  <span>{user?.name || user?.email || 'Account'}</span>
                </summary>
                <div style={{ position: 'absolute', background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 8, marginTop: 8, right: 16 }}>
                  <a href="/api/auth/logout">Logout</a>
                </div>
              </details>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
