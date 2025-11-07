import DashboardClient from './DashboardClient';
import { createMetadata } from '../../lib/seo';

export const metadata = createMetadata({
  title: 'Your dashboard',
  description: 'Review your saved details, credit balance, and start new MP letters in one place.',
  path: '/dashboard',
  noindex: true,
});

export default function DashboardPage() {
  return <DashboardClient />;
}
