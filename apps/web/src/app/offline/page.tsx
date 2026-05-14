'use client';

import { WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

interface CachedOrder {
  id: string;
  orderNumber: string;
  vendorName?: string;
  status?: string;
}

interface CachedVendor {
  id: string;
  slug?: string;
  businessName?: string;
}

/**
 * Static offline fallback shell. Served by the SW (`fallbacks.document`)
 * whenever a navigation hits a route that isn't precached AND we have no
 * network. Two design intents:
 *
 *  1. Stay reassuring — show the brand mark + a clear "Try again" so the
 *     customer doesn't think the app is broken.
 *  2. Surface useful read-only context: cached recent orders from
 *     `localStorage` so the customer can still glance at order numbers /
 *     statuses while disconnected. (Writing the cache is the responsibility
 *     of `/account/orders` and `/orders/[id]/tracking` — they call
 *     `cacheRecentOrders()` in `lib/offline-cache.ts`.)
 *
 * NOTE: this page must NOT use Server Components or runtime data fetching —
 * it has to render entirely from the precached HTML/JS.
 */
export default function OfflinePage() {
  const [orders, setOrders] = useState<CachedOrder[]>([]);
  const [vendors, setVendors] = useState<CachedVendor[]>([]);
  const [online, setOnline] = useState<boolean>(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('feastpot.recent-orders.v1');
      if (raw) setOrders(JSON.parse(raw) as CachedOrder[]);
    } catch {
      /* ignore — corrupt cache simply hides the section */
    }
    try {
      // Written by `useVendors` after a successful list fetch — gives the
      // offline shell something useful to show even for first-time users
      // who haven't placed an order yet.
      const raw = localStorage.getItem('fp.vendors.cache');
      if (raw) setVendors((JSON.parse(raw) as CachedVendor[]).slice(0, 4));
    } catch {
      /* ignore — corrupt cache simply hides the section */
    }
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    const onChange = () => setOnline(navigator.onLine);
    window.addEventListener('online', onChange);
    window.addEventListener('offline', onChange);
    return () => {
      window.removeEventListener('online', onChange);
      window.removeEventListener('offline', onChange);
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white">
        <span className="text-2xl font-bold">FP</span>
      </span>
      <div className="space-y-2">
        <h1 className="flex items-center justify-center gap-2 text-2xl font-bold tracking-tight">
          <WifiOff className="h-5 w-5" aria-hidden /> You&rsquo;re offline
        </h1>
        <p className="text-sm text-muted-foreground">
          {online
            ? 'We couldn&rsquo;t load that page from the cache. Try again in a moment.'
            : 'Check your connection — Feastpot needs the internet to place orders.'}
        </p>
      </div>

      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
      >
        Try again
      </button>

      {vendors.length > 0 && (
        <section className="w-full space-y-2 rounded-lg border border-border p-4 text-left">
          <h2 className="text-sm font-semibold">Last seen vendors</h2>
          <p className="text-[11px] text-muted-foreground">
            From your last visit — may be outdated.
          </p>
          <ul className="divide-y divide-border">
            {vendors.map((v) => (
              <li key={v.id} className="py-2 text-sm">
                {v.slug ? (
                  <Link href={`/vendors/${v.slug}`} className="block hover:underline">
                    {v.businessName ?? 'Vendor'}
                  </Link>
                ) : (
                  <span>{v.businessName ?? 'Vendor'}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {orders.length > 0 && (
        <section className="w-full space-y-2 rounded-lg border border-border p-4 text-left">
          <h2 className="text-sm font-semibold">Recent orders</h2>
          <ul className="divide-y divide-border">
            {orders.slice(0, 5).map((o) => (
              <li key={o.id} className="py-2 text-sm">
                <Link href={`/orders/${o.id}/tracking`} className="block hover:underline">
                  <strong>#{o.orderNumber}</strong>
                  {o.vendorName && <span className="text-muted-foreground"> — {o.vendorName}</span>}
                  {o.status && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize">{o.status}</span>}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">
            These pages will load from your device&rsquo;s cache while offline.
          </p>
        </section>
      )}
    </main>
  );
}
