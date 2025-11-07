import type { Metadata } from 'next';
import Script from 'next/script';
import './global.css';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import AnimatedBackground from '../components/AnimatedBackground';
import CookieConsent from '../components/CookieConsent';
import Providers from './providers';
import { canonicalUrl, getOgImages, seoConfig } from '../lib/seo';

const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? 'G-SYRYHWMLP5';

export const metadata: Metadata = {
  metadataBase: new URL(seoConfig.url),
  title: {
    default: `${seoConfig.name} — ${seoConfig.tagline}`,
    template: `%s — ${seoConfig.name}`,
  },
  description: seoConfig.description,
  manifest: '/site.webmanifest',
  applicationName: seoConfig.shortName,
  category: 'productivity',
  alternates: {
    canonical: canonicalUrl('/'),
  },
  openGraph: {
    type: 'website',
    url: canonicalUrl('/'),
    siteName: seoConfig.name,
    locale: seoConfig.locale,
    title: `${seoConfig.name} — ${seoConfig.tagline}`,
    description: seoConfig.description,
    images: getOgImages(),
  },
  twitter: {
    card: 'summary_large_image',
    title: `${seoConfig.name} — ${seoConfig.tagline}`,
    description: seoConfig.description,
    images: [seoConfig.twitterCard],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

// Ensure this layout (and header) renders dynamically per request
export const dynamic = 'force-dynamic';

const structuredData = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: seoConfig.name,
  applicationCategory: 'ProductivityApplication',
  operatingSystem: 'Web',
  url: canonicalUrl('/'),
  description: seoConfig.description,
  offers: {
    '@type': 'Offer',
    price: '6.99',
    priceCurrency: 'GBP',
    availability: 'https://schema.org/InStock',
  },
  publisher: {
    '@type': 'Organization',
    name: 'Singularity Shift Ltd',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          {gaMeasurementId ? (
            <>
              <Script
                id="gtag-script"
                strategy="afterInteractive"
                src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
              />
              <Script
                id="gtag-init"
                strategy="afterInteractive"
                dangerouslySetInnerHTML={{
                  __html: `
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    gtag('js', new Date());
                    gtag('config', '${gaMeasurementId}');
                  `,
                }}
              />
            </>
          ) : null}
          <script
            type="application/ld+json"
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
          />
          <AnimatedBackground />
          <div className="page-wrap">
            <SiteHeader />
            {children}
            <SiteFooter />
          </div>
          <CookieConsent />
        </Providers>
      </body>
    </html>
  );
}
