import Script from 'next/script';

import Hero from '../components/Hero';
import { createMetadata } from '../lib/seo';

export const metadata = createMetadata({
  title: 'Contact your MP quickly with researched letters',
  description:
    'MPWriter helps UK constituents contact their MP, complain to the government, and write to MPs quickly with AI research, tone controls, and easy exports.',
  path: '/',
});

export default function Index() {
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How quickly can I contact my MP with MPWriter?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Most letters are drafted in minutes. Enter your postcode, share your issue, and MPWriter produces a researched draft ready to send to your MP straight away.',
        },
      },
      {
        '@type': 'Question',
        name: 'Can MPWriter help me complain to a UK government department?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. MPWriter surfaces UK news, parliamentary research, and watchdog reports to help you raise evidence-backed complaints with your MP so they can escalate them to the right government office.',
        },
      },
      {
        '@type': 'Question',
        name: 'Do I need specialist knowledge to write to my MP quickly?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No specialist knowledge is required. The guided flow asks simple questions and suggests tone, structure, and citations so anyone can write to their MP quickly and confidently.',
        },
      },
    ],
  };

  const productSchema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: 'MPWriter',
    description:
      'MPWriter is a UK civic tool that helps constituents contact their MP quickly with researched, citation-backed letters and tone controls.',
    category: 'Civic technology',
    brand: {
      '@type': 'Brand',
      name: 'MPWriter',
    },
    areaServed: {
      '@type': 'Country',
      name: 'United Kingdom',
    },
    audience: {
      '@type': 'Audience',
      audienceType: 'UK constituents',
    },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'GBP',
      lowPrice: '6.99',
      highPrice: '21.99',
      offerCount: '3',
      availability: 'https://schema.org/InStock',
      url: 'https://mpwriter.com/',
    },
    isSimilarTo: {
      '@type': 'Service',
      name: 'UK constituent letter drafting service',
    },
  };

  return (
    <div>
      <Script id="ld-json-faq" type="application/ld+json">
        {JSON.stringify(faqSchema)}
      </Script>
      <Script id="ld-json-product" type="application/ld+json">
        {JSON.stringify(productSchema)}
      </Script>
      <main className="hero-section">
        <Hero />
      </main>
    </div>
  );
}
