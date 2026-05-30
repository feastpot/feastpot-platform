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
 * The vendor portal needs to see ALL menus - including inactive ones - so we
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

/**
 * Persist a drag-to-reorder of whole menus. `menuIds` is the full ordered list
 * of the vendor's menus. Mirrors useReorderMenuItems: optimistically rewrite the
 * cached list so rows stay put while the request is in flight, snapshot the
 * previous order to roll back on error, and re-sync from the server on settle.
 */
export function useReorderMenus(vendorId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (menuIds: string[]) =>
      apiRequest<VendorMenu[]>(`/vendors/${vendorId}/menus/reorder`, {
        method: 'PATCH',
        accessToken: token!,
        body: { menuIds },
      }),
    onMutate: async (menuIds: string[]) => {
      await qc.cancelQueries({ queryKey: KEY(vendorId) });
      const previous = qc.getQueryData<VendorMenu[]>(KEY(vendorId));
      if (previous) {
        const byId = new Map(previous.map((m) => [m.id, m]));
        const reordered = menuIds
          .map((id, index) => {
            const m = byId.get(id);
            return m ? { ...m, sortOrder: index + 1 } : undefined;
          })
          .filter((m): m is VendorMenu => m !== undefined);
        qc.setQueryData<VendorMenu[]>(KEY(vendorId), reordered);
      }
      return { previous };
    },
    onError: (_err, _menuIds, context) => {
      if (context?.previous) {
        qc.setQueryData(KEY(vendorId), context.previous);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY(vendorId) }),
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
