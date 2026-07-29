'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { OrderStatus } from './use-admin-users';
import { useApi } from './use-api';

export type DateRange = 'today' | 'week' | 'month';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled';
export type PiStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'processing'
  | 'requires_capture'
  | 'canceled'
  | 'succeeded'
  | null;

export interface AdminOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalPence: number;
  createdAt: string;
  stripePaymentIntentId: string | null;
  paymentStatus: PaymentStatus | null;
  piStatus: PiStatus;
  customer: { id: string; email: string; firstName: string | null; lastName: string | null };
  vendor: { id: string; businessName: string };
  items: Array<{ nameSnapshot: string; quantity: number }>;
  adminTags: string[];
}

export interface AdminOrdersPage {
  data: AdminOrderRow[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminOrderStats {
  total: number;
  today: number;
  completed: number;
  exceptions: number;
  successRatePct: number | null;
}

export interface AdminOrdersFilters {
  status?: OrderStatus | 'all';
  q?: string;
  range?: DateRange | 'all';
  createdFrom?: string;
  createdTo?: string;
  paymentStatus?: PaymentStatus | 'all';
  withPi: boolean;
  page?: number;
  limit?: number;
}

function buildOrderParams(filters: AdminOrdersFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.range && filters.range !== 'all') params.set('range', filters.range);
  if (filters.createdFrom) params.set('createdFrom', filters.createdFrom);
  if (filters.createdTo) params.set('createdTo', filters.createdTo);
  if (filters.paymentStatus && filters.paymentStatus !== 'all') {
    params.set('paymentStatus', filters.paymentStatus);
  }
  if (filters.q) params.set('q', filters.q);
  return params;
}

export function useAdminOrders(filters: AdminOrdersFilters) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'orders', filters],
    enabled: ready,
    queryFn: () => {
      const params = buildOrderParams(filters);
      if (filters.withPi) params.set('withPiStatus', '1');
      params.set('limit', String(filters.limit ?? 25));
      params.set('page', String(filters.page ?? 1));
      return request<AdminOrdersPage>(`/admin/orders?${params.toString()}`);
    },
  });
}

export function useAdminOrderStats(filters: Omit<AdminOrdersFilters, 'withPi' | 'page' | 'limit'>) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'orders', 'stats', filters],
    enabled: ready,
    queryFn: () => {
      const params = buildOrderParams({ ...filters, withPi: false });
      return request<AdminOrderStats>(`/admin/orders/stats?${params.toString()}`);
    },
  });
}

export function buildOrdersCsvQuery(
  filters: Omit<AdminOrdersFilters, 'withPi' | 'page' | 'limit'>,
): string {
  return buildOrderParams({ ...filters, withPi: false }).toString();
}

export interface BulkStatusResult {
  updated: number;
  failed: number;
  results: Array<{ orderId: string; ok: boolean; error?: string }>;
}

export function useBulkOrderStatus() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { orderIds: string[]; status: OrderStatus; reason: string }) =>
      request<BulkStatusResult>('/admin/orders/bulk/status', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    },
  });
}

export interface BulkTagResult {
  orders: number;
  added: number;
  removed: number;
  missing: number;
}

export function useBulkOrderTags() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { orderIds: string[]; add?: string[]; remove?: string[] }) =>
      request<BulkTagResult>('/admin/orders/bulk/tags', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    },
  });
}

export function useTriggerRefund() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { orderId: string; amountPence: number; reason?: string }) =>
      request<{ id: string }>('/payments/refunds', { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
    },
  });
}
