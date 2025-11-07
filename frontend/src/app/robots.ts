import type { MetadataRoute } from 'next';
import { canonicalUrl } from '../lib/seo';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = canonicalUrl('/');
  const sitemapUrl = `${baseUrl}/sitemap.xml`;
  const host = new URL(baseUrl).host;

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
    ],
    sitemap: sitemapUrl,
    host,
  };
}
