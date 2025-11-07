import CheckoutSuccessClient from './CheckoutSuccessClient';
import { createMetadata } from '../../../lib/seo';

export const metadata = createMetadata({
  title: 'Payment complete',
  description: 'We confirmed your MPWriter credit purchase. Review your balance and get back to writing.',
  path: '/credit-shop/success',
  noindex: true,
});

export default function CheckoutSuccessPage() {
  return <CheckoutSuccessClient />;
}
