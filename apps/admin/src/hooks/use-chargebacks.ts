'use client';

import { useQuery } from '@tanstack/react-query';

import { useApi } from './use-api';

/**
 * Stripe dispute (chargeback) lifecycle statuses as surfaced by the payments
 * API. Kept as a string union for the ones we badge explicitly, with a
 * fallback to plain `string` because Stripe can introduce new statuses.
 */
export type ChargebackStatus =
  | 'needs_response'
  | 'warning_needs_response'
  | 'warning_under_review'
  | 'under_review'
  | 'won'
  | 'lost'
  | 'charge_refunded'
  | (string & {});

export interface ChargebackRow {
  id: string;
  orderId: string;
  paymentId: string;
  stripeDisputeId: string;
  stripeChargeId: string;
  amountPence: number;
  currency: string;
  status: ChargebackStatus;
  reason: string | null;
  evidenceDueBy: string | null;
  openedAt: string | null;
  closedAt: string | null;
  reconciledAt: string | null;
  evidenceWarnedAt: string | null;
  createdAt: string;
  order: {
    id: string;
    orderNumber: string;
    totalPence: number;
  } | null;
}

export interface ChargebacksPage {
  data: ChargebackRow[];
  nextCursor: string | null;
}

export interface ChargebackFilters {
  status?: string;
  orderId?: string;
  cursor?: string;
  limit?: number;
}

function buildParams(filters: ChargebackFilters): string {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.orderId?.trim()) params.set('orderId', filters.orderId.trim());
  if (filters.cursor) params.set('cursor', filters.cursor);
  params.set('limit', String(filters.limit ?? 20));
  return params.toString();
}

export function useChargebacks(filters: ChargebackFilters) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'chargebacks', filters],
    enabled: ready,
    queryFn: () => request<ChargebacksPage>(`/payments/chargebacks?${buildParams(filters)}`),
  });
}

export interface ChargebackStats {
  open: number;
  evidenceDueWithin72h: number;
  lostUnreconciled: number;
  openAmountPence: number;
}

export function useChargebackStats() {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'chargebacks', 'stats'],
    enabled: ready,
    queryFn: () => request<ChargebackStats>(`/payments/chargebacks/stats`),
  });
}
