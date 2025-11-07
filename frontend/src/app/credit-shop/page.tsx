import CreditShopClient from './CreditShopClient';
import { createMetadata } from '../../lib/seo';

export const metadata = createMetadata({
  title: 'Credit shop',
  description: 'Top up MPWriter credits to fund a full research and drafting session whenever you need to contact your MP.',
  path: '/credit-shop',
  noindex: true,
});

export default function CreditShopPage() {
  return <CreditShopClient />;
}
