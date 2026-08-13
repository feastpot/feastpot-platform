'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { computeServiceFeePence, shouldWaiveServiceFee } from '@/lib/service-fee';
import { useFeastPassMembership } from '@/hooks/use-feastpass';
import { useBasketStore } from '@/store/basket.store';

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

interface Props {
  /**
   * Vendor whose profile is currently mounted. The bar only renders when
   * the basket holds items from THIS vendor - preventing the cross-vendor
   * footgun of a customer browsing vendor B while their basket holds
   * vendor A's items, then tapping "View basket" and going to checkout.
   */
  vendorId: string;
}

/**
 * Always-visible floating basket bar shown above the bottom nav while the
 * customer is on a vendor profile and has items from that vendor in the
 * basket. Replaces the older `StickyAddToOrder` which only appeared after
 * scrolling 220px - that gating cost some "Checkout" clicks because the
 * CTA was hidden during the most engaged part of the menu browse.
 *
 * Stacking: bottom-nav is fixed at bottom: 0, height ~64px. We sit
 * `64px + safe-area + 12px gap` above it. z-30 sits below the basket-drawer
 * Sheet's overlay (z-50) so opening the drawer obscures us correctly.
 */
export function FloatingBasketBar({ vendorId }: Props) {
  const pathname = usePathname() ?? '';
  const items = useBasketStore((s) => s.items);
  const basketVendor = useBasketStore((s) => s.vendor);
  const itemCount = items.reduce((acc, i) => acc + i.quantity, 0);
  const subtotalPence = items.reduce((acc, i) => acc + i.lineTotalPence, 0);

  // FeastPass waiver: read the marketplace marker for this vendor and the
  // customer's membership status so the displayed total matches the charge.
  // Conservative default (null) shows the fee; after mount, a found marker
  // may lower the displayed total. A price that falls is fine; one that rises
  // is not (DMCC Act 2024).
  const { data: feastPassData } = useFeastPassMembership();
  const isFeastPassMember = feastPassData?.subscription?.status === 'ACTIVE';
  const [browseAttribution, setBrowseAttribution] = useState<string | null>(null);
  useEffect(() => {
    if (!vendorId) return;
    const key = `fp_mp_${vendorId}`;
    const hasCookie = document.cookie.split(';').some((c) => c.trim().startsWith(`${key}=`));
    const hasLocal = (() => {
      try { return Boolean(localStorage.getItem(key)); } catch { return false; }
    })();
    setBrowseAttribution(hasCookie || hasLocal ? 'MARKETPLACE_FIRST' : null);
  }, [vendorId]);

  const rawServiceFeePence = computeServiceFeePence(subtotalPence);
  const serviceFeePence = shouldWaiveServiceFee(isFeastPassMember, browseAttribution)
    ? 0
    : rawServiceFeePence;
  const totalPence = subtotalPence + serviceFeePence;

  // Don't render on the checkout flow itself - the page already shows
  // the same "View basket / total" affordance, and stacking a floating
  // CTA over a static one creates a duplicate-action smell.
  if (pathname.startsWith('/checkout')) return null;
  if (itemCount === 0 || basketVendor?.id !== vendorId) return null;

  return (
    <div
      className="fixed inset-x-0 z-30 mx-auto max-w-lg px-4 animate-slide-up"
      style={{ bottom: 'calc(64px + env(safe-area-inset-bottom) + 12px)' }}
    >
      <Link
        href="/checkout"
        className="flex w-full items-center justify-between rounded-2xl bg-brand px-4 py-3.5 text-white shadow-card-lg transition-transform active:scale-[0.98]"
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-sm font-bold tabular-nums">
            {itemCount}
          </span>
          <div className="text-left leading-tight">
            <p className="text-[13px] font-semibold">View basket</p>
            <p className="truncate text-[10px] text-white/75">{basketVendor.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="text-right">
            <span className="text-[15px] font-bold tabular-nums">{formatPounds(totalPence)}</span>
            {serviceFeePence > 0 && (
              <p className="text-[9px] text-white/60 leading-none">inc. service fee</p>
            )}
          </div>
          <ChevronRight className="h-5 w-5 text-white/80" aria-hidden />
        </div>
      </Link>
    </div>
  );
}
