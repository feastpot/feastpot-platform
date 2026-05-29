'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { API_URL } from '@/lib/env';

export type ItemCategory = 'tray' | 'soup' | 'protein' | 'swallow' | 'snack' | 'frozen' | 'bundle' | 'event';

export interface MenuItem {
  id: string;
  vendorId: string;
  menuId: string;
  name: string;
  description: string | null;
  category: ItemCategory;
  pricePence: number;
  servingsCount: number | null;
  preparationHours: number;
  imageUrls: string[];
  allergens: string[];
  /** Tag-encoded extras: dietary flags + 'spice:N' + 'portion:LABEL' + 'halal' */
  tags: string[];
  /** Manual display order within the menu (1-based); drag-to-reorder writes this. */
  sortOrder: number;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItemUpsertInput {
  name: string;
  description?: string;
  category: ItemCategory;
  basePricePence: number;
  prepTimeMinutes: number;
  portionLabel?: string;
  spiceLevel?: number;
  isHalal?: boolean;
  dietaryFlags?: string[];
  allergens?: string[];
  images?: string[];
  servingsCount?: number;
  isAvailable?: boolean;
}

const ITEMS_KEY = (vendorId: string, menuId: string) =>
  ['vendor', 'menu-items', vendorId, menuId] as const;
const ITEM_KEY = (vendorId: string, menuId: string, itemId: string) =>
  ['vendor', 'menu-item', vendorId, menuId, itemId] as const;

export function useMenuItems(vendorId: string | undefined, menuId: string | undefined) {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: ITEMS_KEY(vendorId ?? '', menuId ?? ''),
    enabled: !!vendorId && !!menuId && !!token && !loading,
    queryFn: () =>
      apiRequest<MenuItem[]>(`/vendors/${vendorId}/menus/${menuId}/items`, {
        accessToken: token!,
      }),
  });
}

export function useMenuItem(vendorId: string, menuId: string, itemId: string | undefined) {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: ITEM_KEY(vendorId, menuId, itemId ?? ''),
    enabled: !!itemId && itemId !== 'new' && !!token && !loading,
    queryFn: () =>
      apiRequest<MenuItem>(`/vendors/${vendorId}/menus/${menuId}/items/${itemId}`, {
        accessToken: token!,
      }),
  });
}

export function useCreateMenuItem(vendorId: string, menuId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MenuItemUpsertInput) =>
      apiRequest<MenuItem>(`/vendors/${vendorId}/menus/${menuId}/items`, {
        method: 'POST',
        accessToken: token!,
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEMS_KEY(vendorId, menuId) }),
  });
}

export function useUpdateMenuItem(vendorId: string, menuId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ...input }: { itemId: string } & Partial<MenuItemUpsertInput>) =>
      apiRequest<MenuItem>(`/vendors/${vendorId}/menus/${menuId}/items/${itemId}`, {
        method: 'PATCH',
        accessToken: token!,
        body: input,
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ITEMS_KEY(vendorId, menuId) });
      qc.invalidateQueries({ queryKey: ITEM_KEY(vendorId, menuId, variables.itemId) });
    },
  });
}

export function useDeleteMenuItem(vendorId: string, menuId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiRequest<{ deleted: true }>(`/vendors/${vendorId}/menus/${menuId}/items/${itemId}`, {
        method: 'DELETE',
        accessToken: token!,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEMS_KEY(vendorId, menuId) }),
  });
}

/**
 * Persist a drag-to-reorder. `itemIds` is the full ordered list of the menu's
 * items. We optimistically rewrite the cached list so the grid stays put while
 * the request is in flight, snapshot the previous order to roll back on error,
 * and re-sync from the server on settle.
 */
export function useReorderMenuItems(vendorId: string, menuId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemIds: string[]) =>
      apiRequest<MenuItem[]>(`/vendors/${vendorId}/menus/${menuId}/items/reorder`, {
        method: 'PATCH',
        accessToken: token!,
        body: { itemIds },
      }),
    onMutate: async (itemIds: string[]) => {
      await qc.cancelQueries({ queryKey: ITEMS_KEY(vendorId, menuId) });
      const previous = qc.getQueryData<MenuItem[]>(ITEMS_KEY(vendorId, menuId));
      if (previous) {
        const byId = new Map(previous.map((it) => [it.id, it]));
        const reordered = itemIds
          .map((id, index) => {
            const it = byId.get(id);
            return it ? { ...it, sortOrder: index + 1 } : undefined;
          })
          .filter((it): it is MenuItem => it !== undefined);
        qc.setQueryData<MenuItem[]>(ITEMS_KEY(vendorId, menuId), reordered);
      }
      return { previous };
    },
    onError: (_err, _itemIds, context) => {
      if (context?.previous) {
        qc.setQueryData(ITEMS_KEY(vendorId, menuId), context.previous);
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ITEMS_KEY(vendorId, menuId) }),
  });
}

export function useToggleItemAvailability(vendorId: string, menuId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, isAvailable }: { itemId: string; isAvailable: boolean }) =>
      apiRequest<MenuItem>(`/vendors/${vendorId}/menus/${menuId}/items/${itemId}/availability`, {
        method: 'PATCH',
        accessToken: token!,
        body: { isAvailable },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEMS_KEY(vendorId, menuId) }),
  });
}

/**
 * Image upload uses multipart/form-data, so we go around `apiRequest` (which
 * sets JSON headers) and call fetch directly. The endpoint enforces 5 MB / image
 * type validation server-side; we mirror those checks here for fast UX feedback.
 */
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

export interface UploadedImage {
  path: string;
  publicUrl: string;
}

export function useUploadItemImage(vendorId: string, menuId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, file }: { itemId: string; file: File }): Promise<UploadedImage> => {
      if (!ALLOWED.has(file.type)) {
        throw new Error(`Unsupported image type ${file.type}; use JPEG/PNG/WebP`);
      }
      if (file.size > MAX_BYTES) {
        throw new Error('Image exceeds 5 MB');
      }
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(
        `${API_URL}/v1/vendors/${vendorId}/menus/${menuId}/items/${itemId}/images`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd },
      );
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        const msg = (body as { message?: string }).message ?? `Upload failed (${res.status})`;
        throw new Error(msg);
      }
      return (await res.json()) as UploadedImage;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ITEMS_KEY(vendorId, menuId) });
      qc.invalidateQueries({ queryKey: ITEM_KEY(vendorId, menuId, variables.itemId) });
    },
  });
}
