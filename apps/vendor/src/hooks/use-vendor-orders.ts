'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export type VendorOrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'rejected';

export interface VendorOrderItem {
  id: string;
  quantity: number;
  itemName?: string | null;
  // The API returns full OrderItem rows; the dashboard only needs name +
  // quantity for the line list. Other fields (priceCents, modifiers) are
  // ignored here but typed loosely so we don't have to chase every change.
  [key: string]: unknown;
}

export interface VendorOrder {
  id: string;
  orderNumber: string;
  status: VendorOrderStatus;
  customerId: string;
  vendorId: string;
  totalPence: number;
  vendorPayoutPence: number;
  commissionPence: number;
  notes?: string | null;
  scheduledFor?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  customer?: { firstName?: string | null; name?: string | null } | null;
  items: VendorOrderItem[];
}

interface OrdersResponse {
  data: VendorOrder[];
  nextCursor: string | null;
}

const ACTIVE_STATUSES: VendorOrderStatus[] = ['pending', 'accepted', 'preparing', 'dispatched'];

/**
 * Active orders: fetched per-status because the API's `ListOrdersDto` accepts
 * a single `status` filter, not an array. Four small parallel queries are
 * cheaper than client-side filtering of an unbounded list, and TanStack Query
 * dedupes the requests across consumers.
 */
export function useActiveOrders() {
  const { token, loading: authLoading } = useAccessToken();

  return useQuery({
    queryKey: ['vendor', 'orders', 'active'],
    enabled: !!token && !authLoading,
    refetchInterval: 30_000,
    queryFn: async (): Promise<VendorOrder[]> => {
      const responses = await Promise.all(
        ACTIVE_STATUSES.map((status) =>
          apiRequest<OrdersResponse>('/orders', {
            accessToken: token!,
            query: { status, limit: 50 },
          }),
        ),
      );
      const merged = responses.flatMap((r) => r.data);
      // Sort newest-first so brand-new pending orders pop to the top.
      merged.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      return merged;
    },
  });
}

export interface HistoryFilters {
  status?: VendorOrderStatus;
  cursor?: string;
}

export function useOrderHistory(filters: HistoryFilters) {
  const { token, loading: authLoading } = useAccessToken();

  return useQuery({
    queryKey: ['vendor', 'orders', 'history', filters],
    enabled: !!token && !authLoading,
    queryFn: () =>
      apiRequest<OrdersResponse>('/orders', {
        accessToken: token!,
        query: {
          status: filters.status ?? 'delivered',
          cursor: filters.cursor,
          limit: 20,
        },
      }),
  });
}
