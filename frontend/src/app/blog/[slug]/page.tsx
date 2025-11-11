import Link from 'next/link';
import Script from 'next/script';
import { notFound } from 'next/navigation';

import EmailGatedDownload from '../../../components/EmailGatedDownload';
import { createMetadata } from '../../../lib/seo';
import { blogPosts, getBlogPost } from '../../../content/blog';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

type BlogPostPageProps = {
  params: { slug: string };
};

export function generateMetadata({ params }: BlogPostPageProps) {
  const post = getBlogPost(params.slug);

  if (!post) {
    return createMetadata({ title: 'Article not found', noindex: true });
  }

  return createMetadata({
    title: `${post.title} — MPWriter blog`,
    description: post.excerpt,
    path: `/blog/${post.slug}`,
  });
}

const renderParagraph = (text: string, key: string) => (
  <p key={key} dangerouslySetInnerHTML={{ __html: text }} />
);

export default function BlogPostPage({ params }: BlogPostPageProps) {
  const post = getBlogPost(params.slug);

  if (!post) {
    notFound();
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    author: {
      '@type': 'Organization',
      name: 'MPWriter',
    },
    publisher: {
      '@type': 'Organization',
      name: 'MPWriter',
      logo: {
        '@type': 'ImageObject',
        url: 'https://mpwriter.uk/seo/og-image.jpg',
      },
    },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    mainEntityOfPage: `https://mpwriter.uk/blog/${post.slug}`,
  } as const;

  return (
    <main className="hero-section">
      <Script id={`ld-json-article-${post.slug}`} type="application/ld+json">
        {JSON.stringify(articleSchema)}
      </Script>
      <Script id={`ld-json-faq-${post.slug}`} type="application/ld+json">
        {JSON.stringify(faqSchema)}
      </Script>
      <div className="blog-layout">
        <article className="blog-card">
          <header className="blog-header">
            <p className="blog-meta">{post.heroKicker}</p>
            <h1>{post.title}</h1>
            <p style={{ color: '#475569', marginTop: 12 }}>{post.heroDescription}</p>
            <p className="blog-meta" style={{ marginTop: 12 }}>
              Published {new Date(post.publishedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })} ·
              {` ${post.wordCount.toLocaleString()} words`} · ~{post.readingTimeMinutes} min read
            </p>
          </header>

          {post.introduction.map((paragraph, index) => renderParagraph(paragraph, `intro-${index}`))}

          {post.assets.length > 0 && (
            <div>
              {post.assets.map((asset) => (
                <EmailGatedDownload key={asset.slug} assetSlug={asset.slug} title={asset.title} description={asset.description} />
              ))}
            </div>
          )}

          {post.sections.map((section) => (
            <section key={section.id} className="blog-section" id={section.id}>
              <h2>{section.title}</h2>
              {section.content.map((paragraph, index) => renderParagraph(paragraph, `${section.id}-p-${index}`))}
              {section.steps && (
                <ol>
                  {section.steps.map((step, index) => (
                    <li key={`${section.id}-step-${index}`}>
                      <strong>{step.title}</strong>
                      {step.description.map((paragraph, paragraphIndex) => (
                        <p
                          key={`${section.id}-step-${index}-p-${paragraphIndex}`}
                          dangerouslySetInnerHTML={{ __html: paragraph }}
                          style={{ marginTop: 8 }}
                        />
                      ))}
                    </li>
                  ))}
                </ol>
              )}
              {section.checklist && (
                <ul>
                  {section.checklist.map((item, index) => (
                    <li key={`${section.id}-check-${index}`}>{item}</li>
                  ))}
                </ul>
              )}
              {section.template && (
                <div className="blog-template">
                  <h3>{section.template.heading}</h3>
                  <p>{section.template.description}</p>
                  <pre>{section.template.body}</pre>
                </div>
              )}
              {section.callout && (
                <p style={{ background: '#e0f2fe', borderRadius: 12, padding: '12px 16px', marginTop: 16 }}>{section.callout}</p>
              )}
            </section>
          ))}

          <section className="blog-faq">
            <h2>Frequently asked questions</h2>
            <dl>
              {post.faqs.map((faq) => (
                <div key={faq.question}>
                  <dt>{faq.question}</dt>
                  <dd>{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="blog-related">
            <h3 style={{ color: '#0f172a', marginBottom: 4 }}>You might also like</h3>
            {post.relatedLinks.map((link) => (
              <Link key={link.href} href={link.href} className="micro-link">
                {link.label}
              </Link>
            ))}
          </section>
        </article>
      </div>
    </main>
  );
}
