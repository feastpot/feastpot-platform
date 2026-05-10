'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export interface VendorMenu {
  id: string;
  vendorId: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count?: { items: number };
}

const KEY = (vendorId: string) => ['vendor', 'menus', vendorId] as const;

/**
 * The vendor portal needs to see ALL menus — including inactive ones — so we
 * always pass `?includeInactive=true`. The backend will silently downgrade to
 * active-only if the bearer token doesn't match the vendor (defence-in-depth).
 */
export function useMenus(vendorId: string | undefined) {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: KEY(vendorId ?? ''),
    enabled: !!vendorId && !!token && !loading,
    queryFn: () =>
      apiRequest<VendorMenu[]>(`/vendors/${vendorId}/menus`, {
        accessToken: token!,
        query: { includeInactive: 'true' },
      }),
  });
}

export function useCreateMenu(vendorId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) =>
      apiRequest<VendorMenu>(`/vendors/${vendorId}/menus`, {
        method: 'POST',
        accessToken: token!,
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(vendorId) }),
  });
}

export function useUpdateMenu(vendorId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ menuId, ...input }: { menuId: string; name?: string; isActive?: boolean; displayOrder?: number }) =>
      apiRequest<VendorMenu>(`/vendors/${vendorId}/menus/${menuId}`, {
        method: 'PATCH',
        accessToken: token!,
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(vendorId) }),
  });
}

export function useDeleteMenu(vendorId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (menuId: string) =>
      apiRequest<{ deleted: true }>(`/vendors/${vendorId}/menus/${menuId}`, {
        method: 'DELETE',
        accessToken: token!,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(vendorId) }),
  });
}
