import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <a href="https://sshift.xyz/" target="_blank" rel="noopener noreferrer">© 2025 Singularity Shift Ltd</a>
        <nav aria-label="Footer links" className="footer-nav">
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
