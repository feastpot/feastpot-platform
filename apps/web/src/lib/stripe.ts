'use client';

import { loadStripe, type Stripe } from '@stripe/stripe-js';

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

/**
 * Singleton loader. `loadStripe` is async + idempotent under the hood, but
 * calling it multiple times still triggers multiple <script> injections, so
 * we cache the promise here.
 *
 * Returns `null` when the publishable key is not configured - the checkout
 * page surfaces this as a clear "Stripe not configured" notice rather than
 * silently rendering a broken card form.
 */
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> | null {
  if (!PUBLISHABLE_KEY) return null;
  if (!stripePromise) {
    stripePromise = loadStripe(PUBLISHABLE_KEY);
  }
  return stripePromise;
}

export const STRIPE_CONFIGURED = Boolean(PUBLISHABLE_KEY);
