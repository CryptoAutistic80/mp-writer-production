import Hero from '../components/Hero';
import { createMetadata } from '../lib/seo';

export const metadata = createMetadata({
  title: 'Craft researched letters to your MP in minutes',
  description:
    'MPWriter pairs postcode lookup, deep AI research, and tone controls so UK constituents can share persuasive, respectful letters without the busywork.',
  path: '/',
});

export default function Index() {
  return (
    <div>
      <main className="hero-section">
        <Hero />
      </main>
    </div>
  );
}
