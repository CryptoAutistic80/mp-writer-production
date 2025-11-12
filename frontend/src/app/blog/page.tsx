import Link from 'next/link';

import { createMetadata } from '../../lib/seo';
import { blogPosts } from '../../content/blog';

export const metadata = createMetadata({
  title: 'MPWriter blog — guides for contacting your MP',
  description:
    'Read detailed guides on finding your MP, writing persuasive letters, and planning follow-ups. Each article includes templates, FAQs, and gated assets that sync with MPWriter.',
  path: '/blog',
});

export default function BlogIndexPage() {
  const sortedPosts = [...blogPosts].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  return (
    <main className="hero-section">
      <div className="blog-layout">
        <section className="blog-card">
          <header className="blog-header">
            <p className="blog-meta">MPWriter Awareness Hub</p>
            <h1>Step-by-step guides for contacting your MP</h1>
            <p style={{ color: '#475569', marginTop: 12 }}>
              Learn how to confirm who represents you, structure persuasive letters, and follow up effectively. Every article includes
              downloadable templates behind an email gate so your CRM can nurture new supporters.
            </p>
          </header>

          <div className="blog-index">
            {sortedPosts.map((post) => (
              <article key={post.slug} className="blog-index-card">
                <p className="blog-index-meta">
                  Published {new Date(post.publishedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
                <h3>
                  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                </h3>
                <p>{post.excerpt}</p>
                <Link href={`/blog/${post.slug}`} className="micro-link">
                  Read the full guide
                </Link>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
