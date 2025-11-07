import Link from 'next/link';
import WritingDeskClient from './WritingDeskClient';
import { createMetadata } from '../../lib/seo';

export const metadata = createMetadata({
  title: 'Writing Desk workspace',
  description: 'Draft, edit, and export AI-researched letters with citations once you are signed in.',
  path: '/writingDesk',
  noindex: true,
});

export default function WritingDeskPage() {
  return (
    <main className="hero-section">
      <section className="card">
        <div className="container">
          <h1 className="section-title">Writing desk</h1>
          <p className="section-sub">Compose your message and we’ll handle the research and draft.</p>
        </div>
      </section>

      <WritingDeskClient />

      <section className="card" style={{ marginTop: 16 }}>
        <div className="container">
          <p>
            Need to update your saved details first? Head back to the{' '}
            <Link href="/dashboard">dashboard</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
