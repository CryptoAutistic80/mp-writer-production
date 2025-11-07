import CheckoutCancelClient from './CheckoutCancelClient';
import { createMetadata } from '../../../lib/seo';

export const metadata = createMetadata({
  title: 'Checkout cancelled',
  description: 'You left the MPWriter checkout before finishing payment. No charges were made to your account.',
  path: '/credit-shop/cancel',
  noindex: true,
});

export default function CheckoutCancelPage() {
  return <CheckoutCancelClient />;
}
