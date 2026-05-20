'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export type VendorMemberRole =
  | 'owner'
  | 'kitchen_manager'
  | 'finance'
  | 'staff'
  | 'delivery_coordinator';

export interface VendorMemberRow {
  id: string;
  vendorId: string;
  userId: string | null;
  invitedEmail: string;
  role: VendorMemberRole;
  status: 'pending' | 'active' | 'removed';
  acceptedAt: string | null;
  createdAt: string;
  isOwner: boolean;
  user: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
}

export interface VendorMembersList {
  callerRole: VendorMemberRole;
  vendorId: string;
  members: VendorMemberRow[];
}

const KEY = ['vendor', 'members'] as const;
const ROLE_KEY = ['vendor', 'members', 'role'] as const;

export function useVendorMembers() {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: KEY,
    enabled: !!token && !loading,
    queryFn: () => apiRequest<VendorMembersList>('/vendor/members', { accessToken: token! }),
  });
}

export function useMyVendorRole() {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: ROLE_KEY,
    enabled: !!token && !loading,
    queryFn: () =>
      apiRequest<{ vendorId: string | null; role: VendorMemberRole | null }>(
        '/vendor/members/me/role',
        { accessToken: token! },
      ),
    staleTime: 60_000,
  });
}

export function useInviteMember() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: VendorMemberRole }) =>
      apiRequest<VendorMemberRow>('/vendor/members', {
        method: 'POST',
        accessToken: token!,
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateMemberRole() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; role: VendorMemberRole }) =>
      apiRequest<VendorMemberRow>(`/vendor/members/${input.id}`, {
        method: 'PATCH',
        accessToken: token!,
        body: { role: input.role },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveMember() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ id: string }>(`/vendor/members/${id}`, {
        method: 'DELETE',
        accessToken: token!,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

// ---------------- RBAC helpers ----------------

const ROLE_PERMISSIONS: Record<VendorMemberRole, ReadonlyArray<RegExp>> = {
  owner: [/.*/], // everything
  kitchen_manager: [
    /^\/$/, // dashboard
    /^\/orders/,
    /^\/menu/,
    /^\/availability/,
    /^\/compliance/,
    /^\/notifications/,
    /^\/help/,
    /^\/settings\/profile/,
  ],
  finance: [
    /^\/$/,
    /^\/payouts/,
    /^\/analytics/,
    /^\/compliance/,
    /^\/notifications/,
    /^\/settings\/profile/,
    /^\/help/,
  ],
  staff: [/^\/$/, /^\/orders/, /^\/notifications/, /^\/help/],
  delivery_coordinator: [
    /^\/$/,
    /^\/orders/,
    /^\/availability/,
    /^\/notifications/,
    /^\/help/,
  ],
};

export function canVendorRoleAccess(role: VendorMemberRole | null, path: string): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].some((re) => re.test(path));
}
