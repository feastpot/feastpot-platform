'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { API_URL } from '@/lib/env';

import { useApi } from './use-api';

export type AdminUserStatus = 'active' | 'suspended' | 'deleted';
export type AdminUserRole =
  | 'customer'
  | 'vendor'
  | 'admin'
  | 'support'
  | 'finance'
  | 'compliance';

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface AdminUserOrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalPence: number;
  createdAt: string;
  vendor: { id: string; businessName: string };
  items: Array<{ nameSnapshot: string; quantity: number }>;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: AdminUserRole;
  status: AdminUserStatus;
  avatarUrl: string | null;
  createdAt: string;
  vendor: { id: string; businessName: string; status: string } | null;
  orderCount: number;
  loyaltyBalance: number;
  lifetimeSpendPence: number;
  orders: AdminUserOrderRow[];
}

/**
 * Email lookup is `enabled: false` until the user submits the form so we
 * don't hammer the API as they type. Caller calls `refetch()` on submit.
 */
export function useAdminUserSearch(email: string) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'users', 'search', email.trim().toLowerCase()],
    enabled: false,
    retry: false,
    queryFn: () =>
      request<AdminUserDetail>(
        `/admin/users/search?email=${encodeURIComponent(email.trim())}`,
      ),
  });
}

interface MutateOpts {
  onSuccess?: () => void;
}

export function useIssueCredit(userId: string, opts: MutateOpts = {}) {
  const { request, ready } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { amountPence: number; reason: string }) =>
      request<{ success: true }>(`/admin/users/${userId}/credit`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users', 'search'] });
      opts.onSuccess?.();
    },
    networkMode: 'always',
  });
}

export function useSuspendUser(userId: string, opts: MutateOpts = {}) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { reason: string }) =>
      request<{ success: true }>(`/admin/users/${userId}/suspend`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users', 'search'] });
      opts.onSuccess?.();
    },
  });
}

export function useReinstateUser(userId: string, opts: MutateOpts = {}) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ success: true }>(`/admin/users/${userId}/reinstate`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users', 'search'] });
      opts.onSuccess?.();
    },
  });
}

export function useOverrideOrderStatus(opts: MutateOpts = {}) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      status,
      reason,
    }: {
      orderId: string;
      status: OrderStatus;
      reason: string;
    }) =>
      request<unknown>(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: { status, reason },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users', 'search'] });
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      opts.onSuccess?.();
    },
  });
}

/**
 * DSAR / GDPR export — fetches the JSON via authenticated fetch (so the
 * bearer token is attached) and triggers a browser download. Bypasses the
 * apiRequest helper because we want the raw blob, not a parsed object.
 */
export function useExportUser() {
  const { token } = useApi();
  return async (userId: string) => {
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`${API_URL}/v1/admin/users/${userId}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `feastpot-user-${userId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
}
