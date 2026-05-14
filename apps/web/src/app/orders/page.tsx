import { redirect } from 'next/navigation';

/**
 * Bare `/orders` has no list view — the customer order history lives under
 * `/account/orders` (auth-gated). Vercel logs showed real users guessing
 * `/orders` from the URL bar and hitting a 404, so we 308-redirect here.
 * 308 (vs 307) tells search engines and link previews this is permanent.
 */
export default function OrdersIndexPage() {
  redirect('/account/orders');
}
