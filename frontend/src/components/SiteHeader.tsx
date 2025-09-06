import Link from 'next/link';

export default function SiteHeader() {
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
        </nav>
      </div>
    </header>
  );
}


