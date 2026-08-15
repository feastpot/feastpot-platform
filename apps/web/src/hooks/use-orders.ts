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

/**
 * Read a single cookie value from document.cookie.
 * Returns undefined in SSR or when the cookie is absent.
 */
function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : undefined;
}

/**
 * Read a localStorage value, falling back gracefully in private/restricted
 * browsing environments.
 */
function readLocalStorage(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build attribution headers for an order creation request.
 * Reads the three marker cookies/localStorage entries that may have been set by
 * /v/[slug] (vendor referral) or MarketplaceTagger (organic browse).
 *
 * Priority is enforced server-side (marketplace 90-day marker beats vendor
 * 30-day marker), but we send both so the API always has the full picture.
 */
function buildAttributionHeaders(vendorId: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const fpRef = readCookie('fp_ref');
  if (fpRef) headers['x-fp-ref'] = fpRef;
  const fpSid = readCookie('fp_sid');
  if (fpSid) headers['x-fp-sid'] = fpSid;
  // Marketplace marker: keyed by vendorId so each vendor's attribution is independent.
  const mpKey = `fp_mp_${vendorId}`;
  const fpMktp = readCookie(mpKey) ?? readLocalStorage(mpKey);
  if (fpMktp) headers['x-fp-mktplace'] = fpMktp;
  return headers;
}

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
      // Read attribution marker cookies and pass them as API headers so the
      // server can apply the correct commission rate and record the attribution.
      const attributionHeaders = buildAttributionHeaders(input.vendorId);
      return createOrder(
        input,
        token,
        Object.keys(attributionHeaders).length > 0 ? attributionHeaders : undefined,
      );
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
