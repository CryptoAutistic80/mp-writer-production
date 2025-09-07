import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <span>© 2025 Singularity Shift Ltd</span>
        <nav>
          <Link href="/contact">Contact</Link>
        </nav>
      </div>
    </footer>
  );
}

