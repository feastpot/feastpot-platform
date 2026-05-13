'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { OrderStatus } from './use-admin-users';
import { useApi } from './use-api';

export type DateRange = 'today' | 'week' | 'month';
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
  piStatus: PiStatus;
  customer: { id: string; email: string; firstName: string | null; lastName: string | null };
  vendor: { id: string; businessName: string };
  items: Array<{ nameSnapshot: string; quantity: number }>;
}

export function useAdminOrders(filters: {
  status?: OrderStatus | 'all';
  q?: string;
  range?: DateRange | 'all';
  withPi: boolean;
}) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'orders', filters],
    enabled: ready,
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status && filters.status !== 'all') params.set('status', filters.status);
      if (filters.range && filters.range !== 'all') params.set('range', filters.range);
      if (filters.q) params.set('q', filters.q);
      if (filters.withPi) params.set('withPiStatus', '1');
      params.set('limit', '50');
      return request<AdminOrderRow[]>(`/admin/orders?${params.toString()}`);
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
