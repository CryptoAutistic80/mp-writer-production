import MyLettersClient from './MyLettersClient';
import { createMetadata } from '../../lib/seo';

export const dynamic = 'force-dynamic';

export const metadata = createMetadata({
  title: 'Saved letters',
  description: 'Revisit the MP letters you generated with MPWriter so you can edit, export, or send them later.',
  path: '/myLetters',
  noindex: true,
});

export default function MyLettersPage() {
  return <MyLettersClient />;
}
