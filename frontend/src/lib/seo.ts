import type { Metadata, MetadataRoute } from 'next';

const FALLBACK_SITE_URL = 'https://mpwriter.uk';
const rawSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const normalizedSiteUrl = rawSiteUrl
  ? rawSiteUrl.startsWith('http://') || rawSiteUrl.startsWith('https://')
    ? rawSiteUrl
    : `https://${rawSiteUrl}`
  : FALLBACK_SITE_URL;
const siteUrl = normalizedSiteUrl.replace(/\/+$/, '');

export const seoConfig = {
  name: 'MPWriter',
  shortName: 'MPWriter',
  tagline: 'Your voice, clearly heard.',
  description: 'Craft researched, respectful letters to your MP in minutes with MPWriter.',
  url: siteUrl,
  locale: 'en_GB',
  twitterCard: '/seo/twitter-card.jpg',
} as const;

const ogImages = {
  default: [
    { url: '/seo/og-image.jpg', width: 1200, height: 630, alt: 'MPWriter hero illustration' },
    { url: '/seo/og-image@2x.jpg', width: 2400, height: 1260, alt: 'MPWriter hero illustration (high resolution)' },
  ],
  square: [{ url: '/seo/social-square.jpg', width: 1080, height: 1080, alt: 'MPWriter square artwork' }],
} satisfies Record<
  'default' | 'square',
  NonNullable<NonNullable<Metadata['openGraph']>['images']>
>;

const indexableRobots: NonNullable<Metadata['robots']> = {
  index: true,
  follow: true,
};

const noindexRobots: NonNullable<Metadata['robots']> = {
  index: false,
  follow: false,
  noarchive: true,
  nocache: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
    nositelinkssearchbox: true,
  },
};

export type OgImageVariant = keyof typeof ogImages;

export type CreateMetadataOptions = {
  title?: string;
  description?: string;
  path?: string;
  ogVariant?: OgImageVariant;
  noindex?: boolean;
  type?: NonNullable<Metadata['openGraph']>['type'];
};

export const canonicalUrl = (path = '/'): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return normalizedPath === '/' ? siteUrl : `${siteUrl}${normalizedPath}`;
};

export function createMetadata({
  title,
  description,
  path = '/',
  ogVariant = 'default',
  noindex,
  type = 'website',
}: CreateMetadataOptions = {}): Metadata {
  const resolvedTitle = title ?? `${seoConfig.name} — ${seoConfig.tagline}`;
  const resolvedDescription = description ?? seoConfig.description;
  const canonical = canonicalUrl(path);

  return {
    title: resolvedTitle,
    description: resolvedDescription,
    alternates: {
      canonical,
    },
    openGraph: {
      title: resolvedTitle,
      description: resolvedDescription,
      url: canonical,
      siteName: seoConfig.name,
      locale: seoConfig.locale,
      type,
      images: ogImages[ogVariant] ?? ogImages.default,
    },
    twitter: {
      card: 'summary_large_image',
      title: resolvedTitle,
      description: resolvedDescription,
      images: [seoConfig.twitterCard],
    },
    robots: noindex ? noindexRobots : indexableRobots,
  };
}

export const getOgImages = (variant: OgImageVariant = 'default') => ogImages[variant] ?? ogImages.default;

export const marketingPages: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: MetadataRoute.Sitemap[number]['priority'];
}> = [
  { path: '/', changeFrequency: 'weekly', priority: 1 },
  { path: '/how-it-works', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/contact', changeFrequency: 'monthly', priority: 0.5 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.4 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.4 },
];
