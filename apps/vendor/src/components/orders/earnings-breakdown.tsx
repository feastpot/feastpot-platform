'use client';

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

/**
 * Read-only earnings breakdown for a single order.
 *
 * IMPORTANT: this component performs NO arithmetic whatsoever - not even
 * pence→pounds formatting. It receives four already-formatted display
 * strings, produced by the parent from values the API stored at
 * order-creation time (the output of computeCommission):
 *   - subtotal    → food subtotal
 *   - commission  → platform commission (PLATFORM_FACTS.commission.marketplaceFirst % of food subtotal)
 *   - deliveryFee → vendor delivery fee, retained in full
 *   - netPayable  → net payable to the vendor
 */
interface EarningsBreakdownProps {
  subtotal: string;
  commission: string;
  deliveryFee: string;
  netPayable: string;
}

export function EarningsBreakdown({
  subtotal,
  commission,
  deliveryFee,
  netPayable,
}: EarningsBreakdownProps) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 text-sm">
      <dl className="space-y-1.5">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Food subtotal</dt>
          <dd className="tabular-nums">{subtotal}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            {PLATFORM_FACTS.brandName} commission ({PLATFORM_FACTS.commission.marketplaceFirst}% of
            food subtotal)
          </dt>
          <dd className="tabular-nums">−{commission}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Your delivery fee (kept in full)</dt>
          <dd className="tabular-nums">{deliveryFee}</dd>
        </div>
        <div className="flex justify-between border-t pt-1.5 font-semibold">
          <dt>Net payable to you</dt>
          <dd className="tabular-nums">{netPayable}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        {PLATFORM_FACTS.brandName} charges {PLATFORM_FACTS.commission.marketplaceFirst}% of the food
        subtotal on completed orders. Your delivery fee is yours in full.
      </p>
    </div>
  );
}
