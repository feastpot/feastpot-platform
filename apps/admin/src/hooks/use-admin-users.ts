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

export type JoinedRange = 'today' | 'week' | 'month' | 'year';

export interface AdminUserRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: AdminUserRole;
  status: AdminUserStatus;
  avatarUrl: string | null;
  createdAt: string;
  orderCount: number;
  lifetimeSpendPence: number;
}

export interface AdminUserListResponse {
  data: AdminUserRow[];
  total: number;
  nextCursor: string | null;
}

export interface AdminUserListFilters {
  q?: string;
  role?: AdminUserRole | 'all';
  status?: AdminUserStatus | 'all';
  joined?: JoinedRange | 'all';
  cursor?: string | null;
  limit?: number;
}

/**
 * Paginated user list for the admin Users table. Backed by
 * GET /v1/admin/users. Cursor + total returned; UI shows
 * "Showing N of T users" and prev/next paging.
 */
export function useAdminUsersList(filters: AdminUserListFilters) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'users', 'list', filters],
    enabled: ready,
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.q?.trim()) params.set('q', filters.q.trim());
      if (filters.role && filters.role !== 'all') params.set('role', filters.role);
      if (filters.status && filters.status !== 'all') params.set('status', filters.status);
      if (filters.joined && filters.joined !== 'all') params.set('joined', filters.joined);
      if (filters.cursor) params.set('cursor', filters.cursor);
      params.set('limit', String(filters.limit ?? 25));
      return request<AdminUserListResponse>(`/admin/users?${params.toString()}`);
    },
    placeholderData: (prev) => prev,
  });
}

/**
 * Email lookup is `enabled: false` until the user submits the form so we
 * don't hammer the API as they type. Caller calls `refetch()` on submit.
 */
export function useAdminUserSearch(email: string) {
  const { request } = useApi();
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
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { amountPence: number; reason: string }) =>
      request<{ success: true }>(`/admin/users/${userId}/credit`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
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
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      opts.onSuccess?.();
    },
  });
}

export type StaffRoleValue = 'admin' | 'support' | 'finance' | 'compliance';

export interface CreateStaffUserInput {
  email: string;
  firstName: string;
  lastName: string;
  role: StaffRoleValue;
  sendInvite?: boolean;
}

export interface CreateStaffUserResult {
  id: string;
  email: string;
  role: AdminUserRole;
  inviteEmailSent: boolean;
}

/**
 * POST /v1/admin/users — admin-only. Creates a Supabase auth user +
 * Prisma User row pinned to the same uid, optionally emails a magic-link
 * invite. Invalidates the users list on success.
 */
export function useCreateStaffUser(opts: MutateOpts = {}) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateStaffUserInput) =>
      request<CreateStaffUserResult>(`/admin/users`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      opts.onSuccess?.();
    },
  });
}

/**
 * PATCH /v1/admin/users/:userId/role — admin-only. Reason is required
 * (10–500 chars) and audited.
 */
export function useUpdateUserRole(userId: string, opts: MutateOpts = {}) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { role: StaffRoleValue; reason: string }) =>
      request<{ success: true }>(`/admin/users/${userId}/role`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
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
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
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
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
      opts.onSuccess?.();
    },
  });
}

/**
 * DSAR / GDPR export - fetches the JSON via authenticated fetch (so the
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
