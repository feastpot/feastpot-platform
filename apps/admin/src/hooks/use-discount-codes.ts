'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './use-api';

export type DiscountType = 'flat' | 'percentage';

export interface DiscountCodeRow {
  id: string;
  code: string;
  type: DiscountType;
  value: number;
  minOrderPence: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  vendorId: string | null;
  vendor: { id: string; businessName: string } | null;
  isActive: boolean;
  createdAt: string;
  _count: { orders: number };
}

export interface DiscountCodesPage {
  data: DiscountCodeRow[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateDiscountCodeInput {
  code: string;
  type: DiscountType;
  value: number;
  minOrderPence?: number;
  maxUses?: number;
  expiresAt?: string;
  vendorId?: string;
  isActive?: boolean;
}

export function useDiscountCodes(page = 1) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'discount-codes', page],
    enabled: ready,
    queryFn: () =>
      request<DiscountCodesPage>(`/admin/discount-codes?page=${page}&limit=50`),
  });
}

export function useCreateDiscountCode() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDiscountCodeInput) =>
      request<DiscountCodeRow>('/admin/discount-codes', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'discount-codes'] }),
  });
}

export function useToggleDiscountCode() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      request<DiscountCodeRow>(`/admin/discount-codes/${id}`, { method: 'PATCH', body: { isActive } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'discount-codes'] }),
  });
}
