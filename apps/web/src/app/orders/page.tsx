'use client';

import { UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useAccessToken } from '@/lib/auth/use-access-token';

/**
 * `/orders` is the URL real users guess from the address bar (Vercel
 * logs confirm this) — and it's also the destination of the bottom-nav
 * "Orders" tab, which curious first-time visitors tap before they've
 * signed up. Behaviour:
 *
 *  - Signed in → forward to `/account/orders` (the real list view).
 *  - Not signed in → render an inline guest CTA. The previous server
 *    redirect bounced guests through `/account/orders` → middleware →
 *    `/sign-in`, which felt like a punishment for tapping a nav item.
 *  - Loading → skeleton, so we don't flash the guest CTA at a user who
 *    is in fact signed in (would feel like a session loss).
 */
export default function OrdersIndexPage() {
  const router = useRouter();
  const { token, loading } = useAccessToken();

  useEffect(() => {
    if (!loading && token) router.replace('/account/orders');
  }, [loading, token, router]);

  if (loading || token) {
    // Skeleton placeholder for the redirect frame. Kept intentionally
    // bland — three muted cards are enough to communicate "loading"
    // without us having to import the real OrdersList skeleton.
    return (
      <div className="space-y-3 px-4 py-6" aria-hidden>
        <div className="h-24 animate-pulse rounded-2xl bg-cream-warm/60" />
        <div className="h-24 animate-pulse rounded-2xl bg-cream-warm/60" />
        <div className="h-24 animate-pulse rounded-2xl bg-cream-warm/60" />
      </div>
    );
  }

  return (
    <section className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <span
        className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-brand-light"
        aria-hidden
      >
        <UtensilsCrossed className="h-10 w-10 text-brand" />
      </span>
      <h1 className="font-display text-[22px] font-black text-charcoal">
        Your orders will appear here
      </h1>
      <p className="mt-2 max-w-[280px] text-sm font-medium leading-relaxed text-charcoal-mid">
        Sign in to track your orders, reorder favourites, and manage your account.
      </p>
      <Link
        href="/sign-in?redirect=/account/orders"
        className="touch-target mt-6 inline-block rounded-2xl bg-brand px-7 py-3.5 text-[15px] font-bold text-white shadow-card transition-colors hover:bg-brand-dark"
      >
        Sign in to your account
      </Link>
      <Link
        href="/vendors"
        className="mt-3 text-[13px] font-medium text-charcoal-mid hover:text-charcoal"
      >
        Continue browsing without signing in →
      </Link>
    </section>
  );
}
