'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

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
