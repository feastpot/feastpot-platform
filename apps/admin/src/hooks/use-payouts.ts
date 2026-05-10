'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './use-api';

export type PayoutStatus = 'draft' | 'held' | 'approved' | 'transferred' | 'failed';

export interface PayoutRow {
  id: string;
  vendorId: string;
  vendor?: { id: string; businessName: string } | null;
  status: PayoutStatus;
  amountPence: number;
  commissionPence: number;
  refundsPence: number;
  periodStart: string | null;
  periodEnd: string | null;
  transferredAt: string | null;
  stripeTransferId: string | null;
  holdReason: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface PayoutsPage {
  data: PayoutRow[];
  nextCursor: string | null;
}

export function usePayouts(filters: { status?: PayoutStatus }) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'payouts', filters],
    enabled: ready,
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      params.set('limit', '100');
      return request<PayoutsPage>(`/payouts?${params.toString()}`);
    },
  });
}

export function useApprovePayout() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => request(`/payouts/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payouts'] }),
  });
}

export function useHoldPayout() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, holdReason }: { id: string; holdReason: string }) =>
      request(`/payouts/${id}/hold`, { method: 'PATCH', body: { holdReason } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payouts'] }),
  });
}

export interface ReconcileResult {
  payoutId: string;
  stripeTransferId: string | null;
  ourAmountPence: number;
  stripeAmountPence: number | null;
  discrepancyPence: number | null;
  status: 'match' | 'mismatch' | 'no_transfer' | 'stripe_error';
  error?: string;
}

export function useReconcilePayout() {
  const { request } = useApi();
  return useMutation({
    mutationFn: (id: string) =>
      request<ReconcileResult>(`/admin/payouts/${id}/reconcile-stripe`, { method: 'POST' }),
  });
}
