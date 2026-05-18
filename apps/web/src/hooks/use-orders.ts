'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAccessToken } from '@/lib/auth/use-access-token';
import {
  cancelOrder,
  confirmOrder,
  createOrder,
  getOrder,
  listOrders,
  reorder,
  respondToAmendment,
  type CreateOrderInput,
  type ListOrdersResponse,
  type OrderStatus,
  type ReorderInput,
} from '@/lib/api/orders';

const ORDERS_KEY = 'orders';

/** Single order - used by the tracking page. Polls every 30s as a fallback to
 * Supabase Realtime so we never get stuck on a stale status. */
export function useOrder(orderId: string | undefined) {
  const { token } = useAccessToken();
  return useQuery({
    queryKey: [ORDERS_KEY, 'one', orderId],
    queryFn: ({ signal }) => getOrder(orderId!, token!, { signal }),
    enabled: Boolean(orderId && token),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

/** Customer order history. Cursor-paginated. */
export function useOrders(params: { status?: OrderStatus } = {}) {
  const { token } = useAccessToken();
  return useInfiniteQuery<ListOrdersResponse, Error>({
    queryKey: [ORDERS_KEY, 'list', params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      listOrders({ ...params, cursor: pageParam as string | undefined }, token!, { signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(token),
  });
}

export function useCreateOrder() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput) => {
      if (!token) throw new Error('Not signed in');
      return createOrder(input, token);
    },
    onSuccess: () => {
      // List view becomes stale the moment a new order exists.
      void qc.invalidateQueries({ queryKey: [ORDERS_KEY, 'list'] });
    },
  });
}

export function useConfirmOrder() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => {
      if (!token) throw new Error('Not signed in');
      return confirmOrder(orderId, token);
    },
    onSuccess: (_, orderId) => {
      void qc.invalidateQueries({ queryKey: [ORDERS_KEY, 'one', orderId] });
    },
  });
}

export function useReorder() {
  const { token } = useAccessToken();
  return useMutation({
    mutationFn: ({ orderId, input }: { orderId: string; input: ReorderInput }) => {
      if (!token) throw new Error('Not signed in');
      return reorder(orderId, input, token);
    },
  });
}

/** Customer accepts/declines a vendor-proposed amendment. */
export function useRespondAmendment(orderId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accepted: boolean) => {
      if (!token) throw new Error('Not signed in');
      return respondToAmendment(orderId, accepted, token);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [ORDERS_KEY, 'one', orderId] });
    },
  });
}

export function useCancelOrder() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) => {
      if (!token) throw new Error('Not signed in');
      return cancelOrder(orderId, reason, token);
    },
    onSuccess: (_, { orderId }) => {
      void qc.invalidateQueries({ queryKey: [ORDERS_KEY, 'one', orderId] });
      void qc.invalidateQueries({ queryKey: [ORDERS_KEY, 'list'] });
    },
  });
}
