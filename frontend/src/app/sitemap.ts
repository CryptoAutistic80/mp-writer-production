import type { MetadataRoute } from 'next';
import { canonicalUrl, marketingPages } from '../lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return marketingPages.map(({ path, changeFrequency, priority }) => ({
    url: canonicalUrl(path),
    lastModified,
    changeFrequency,
    priority,
  }));
}
