'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export type PayoutStatus = 'draft' | 'held' | 'approved' | 'transferred' | 'failed';

export interface VendorPayout {
  id: string;
  vendorId: string;
  status: PayoutStatus;
  amountPence: number;
  grossPence: number;
  commissionPence: number;
  refundsPence: number;
  orderCount: number;
  periodStart: string | null;
  periodEnd: string | null;
  holdReason: string | null;
  currency: string;
  approvedAt: string | null;
  transferredAt: string | null;
  failureReason: string | null;
  createdAt: string;
}

interface PayoutsPage {
  data: VendorPayout[];
  nextCursor: string | null;
}

/**
 * Cursor-paginated payout history. We use `useInfiniteQuery` so "Load more"
 * appends to a single accumulated list rather than swapping pages out (which
 * was previously breaking pending-totals computed from the on-screen rows).
 */
export interface PayoutsSummary {
  nextPayoutDate: string | null;
  pendingPence: number;
  paidToDatePence: number;
  /** Founding allowance granted to this vendor (initial £2,000 + any referral top-ups). */
  foundingAllowanceGrantedPence: number;
  /** Pence of founding allowance already consumed by completed orders. */
  foundingAllowanceUsedPence: number;
}

/**
 * Read-only rollup from GET /v1/payouts/summary - next payout date, amount
 * pending, amount paid to date. All figures are aggregated server-side from
 * existing payout rows; the client only displays them.
 */
export function usePayoutsSummary() {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: ['vendor', 'payouts', 'summary'] as const,
    enabled: !!token && !loading,
    queryFn: () => apiRequest<PayoutsSummary>('/payouts/summary', { accessToken: token! }),
  });
}

export function usePayouts() {
  const { token, loading } = useAccessToken();
  return useInfiniteQuery({
    queryKey: ['vendor', 'payouts'] as const,
    enabled: !!token && !loading,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: PayoutsPage) => lastPage.nextCursor ?? undefined,
    queryFn: ({ pageParam }) =>
      apiRequest<PayoutsPage>('/payouts', {
        accessToken: token!,
        query: { limit: 20, cursor: pageParam },
      }),
  });
}

/**
 * One order row within a payout batch. commissionPence and vendorPayoutPence
 * reflect post-refund figures (adjusted by the charge.refunded webhook handler).
 */
export interface VendorPayoutOrder {
  id: string;
  orderNumber: string;
  deliveredAt: string | null;
  subtotalPence: number;
  commissionPence: number;
  vendorPayoutPence: number;
  /** Three-tier label from order_attributions.resolved_source, or null for
   *  pre-attribution rows (treat as MARKETPLACE_FIRST on display). */
  attributionSource: string | null;
  /** Who funded the customer discount. 'PLATFORM' = Feastpot absorbed it (vendor
   *  earnings unchanged). 'VENDOR' = deducted from vendor payout. Null when no
   *  discount was applied. Only present on orders created after Aug 2026. */
  discountFundedBy: 'PLATFORM' | 'VENDOR' | null;
  discountPence: number;
  /**
   * Pence of food subtotal covered by the vendor's founding allowance on this
   * order. When > 0, the commission cell shows a "Founding offer" label. Zero
   * on VENDOR_REFERRED orders and on orders created before the allowance launched.
   */
  foundingAllowanceAppliedPence: number;
}

/**
 * Lazy-loads the individual orders within a payout batch.
 * Disabled when payoutId is null so callers can conditionally expand rows.
 */
export function usePayoutOrders(payoutId: string | null) {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: ['vendor', 'payout-orders', payoutId] as const,
    enabled: !!payoutId && !!token && !loading,
    queryFn: () =>
      apiRequest<VendorPayoutOrder[]>(`/payouts/${payoutId!}/orders`, { accessToken: token! }),
  });
}
