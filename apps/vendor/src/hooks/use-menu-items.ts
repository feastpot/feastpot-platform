'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { API_URL } from '@/lib/env';

/** Free-text category string. Historic values: tray, soup, protein, swallow, snack, frozen, bundle, event. */
export type ItemCategory = string;

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
  /**
   * Affirmative declaration that the dish contains none of the FSA 14 allergens.
   * Distinct from an empty allergens array (which means "not declared").
   */
  allergensFreeFrom: boolean;
  /** Tag-encoded extras: dietary flags + 'spice:N' + 'portion:LABEL' + 'halal' + 'sold_out' */
  tags: string[];
  /** Manual display order within the menu (1-based); drag-to-reorder writes this. */
  sortOrder: number;
  isAvailable: boolean;
  /**
   * Moderation state mirrored from the API. `held` = waiting for admin review,
   * `rejected` = blocked; both stay hidden from customers regardless of
   * isAvailable. `auto_approved` / `approved` are live.
   */
  moderationStatus: 'auto_approved' | 'held' | 'approved' | 'rejected';
  /** Manual-pilot review context, supplied when the API has moderation metadata. */
  moderationReason?: string | null;
  moderationSubmittedAt?: string | null;
  moderatedAt?: string | null;
  slaDueAt?: string | null;
  isModerationOverdue?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MenuModerationPolicy {
  mode: 'manual_pilot' | 'automatic' | 'manual' | string;
  turnaroundHours: number;
  label?: string;
}

interface MenuItemApiResponse extends MenuItem {
  decisionReason?: string | null;
  submittedAt?: string | null;
  decidedAt?: string | null;
}

function normalizeMenuItem(item: MenuItemApiResponse): MenuItem {
  const submittedAt = item.moderationSubmittedAt ?? item.submittedAt ?? null;
  const dueAt =
    item.slaDueAt ??
    (submittedAt
      ? new Date(new Date(submittedAt).getTime() + 72 * 60 * 60 * 1000).toISOString()
      : null);
  return {
    ...item,
    moderationReason: item.moderationReason ?? item.decisionReason ?? null,
    moderationSubmittedAt: submittedAt,
    moderatedAt: item.moderatedAt ?? item.decidedAt ?? null,
    slaDueAt: dueAt,
    isModerationOverdue:
      item.isModerationOverdue ??
      (item.moderationStatus === 'held' && !!dueAt && new Date(dueAt).getTime() < Date.now()),
  };
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
  /** Affirmative: dish contains none of the 14 FSA allergens. */
  allergensFreeFrom?: boolean;
  images?: string[];
  servingsCount?: number;
  isAvailable?: boolean;
  /** When true, adds 'sold_out' tag and sets isAvailable=false server-side. */
  soldOut?: boolean;
}

const ITEMS_KEY = (vendorId: string, menuId: string) =>
  ['vendor', 'menu-items', vendorId, menuId] as const;
const ITEM_KEY = (vendorId: string, menuId: string, itemId: string) =>
  ['vendor', 'menu-item', vendorId, menuId, itemId] as const;
const ALLERGEN_REMEDIATION_KEY = (vendorId: string) =>
  ['vendor', 'allergen-remediation', vendorId] as const;
export const MODERATION_POLICY_KEY = (vendorId: string) =>
  ['vendor', 'menu-moderation-policy', vendorId] as const;

export function useMenuModerationPolicy(vendorId: string | undefined) {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: MODERATION_POLICY_KEY(vendorId ?? ''),
    enabled: !!vendorId && !!token && !loading,
    retry: false,
    queryFn: () =>
      apiRequest<MenuModerationPolicy>(`/vendors/${vendorId}/menu-moderation-policy`, {
        accessToken: token!,
      }),
  });
}

export interface AllergenRemediationResponse {
  count: number;
  items: Array<
    MenuItem & {
      remediatedAt: string;
      priorIsAvailable: boolean;
    }
  >;
}

export function useAllergenRemediation(vendorId: string | undefined) {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: ALLERGEN_REMEDIATION_KEY(vendorId ?? ''),
    enabled: !!vendorId && !!token && !loading,
    queryFn: () =>
      apiRequest<AllergenRemediationResponse>(`/vendors/${vendorId}/allergen-remediation`, {
        accessToken: token!,
      }),
  });
}

export function useMenuItems(
  vendorId: string | undefined,
  menuId: string | undefined,
  filters?: { allergenStatus?: 'needs_declaration' | 'remediation_required' },
) {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: [...ITEMS_KEY(vendorId ?? '', menuId ?? ''), filters] as const,
    enabled: !!vendorId && !!menuId && !!token && !loading,
    queryFn: () =>
      apiRequest<MenuItemApiResponse[]>(
        `/vendors/${vendorId}/menus/${menuId}/items${
          filters?.allergenStatus ? `?allergenStatus=${filters.allergenStatus}` : ''
        }`,
        {
          accessToken: token!,
        },
      ).then((items) => items.map(normalizeMenuItem)),
  });
}

export function useMenuItem(vendorId: string, menuId: string, itemId: string | undefined) {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: ITEM_KEY(vendorId, menuId, itemId ?? ''),
    enabled: !!itemId && itemId !== 'new' && !!token && !loading,
    queryFn: () =>
      apiRequest<MenuItemApiResponse>(`/vendors/${vendorId}/menus/${menuId}/items/${itemId}`, {
        accessToken: token!,
      }).then(normalizeMenuItem),
  });
}

export function useCreateMenuItem(vendorId: string, menuId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MenuItemUpsertInput) =>
      apiRequest<MenuItemApiResponse>(`/vendors/${vendorId}/menus/${menuId}/items`, {
        method: 'POST',
        accessToken: token!,
        body: input,
      }).then(normalizeMenuItem),
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEMS_KEY(vendorId, menuId) }),
  });
}

export function useUpdateMenuItem(vendorId: string, menuId: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, ...input }: { itemId: string } & Partial<MenuItemUpsertInput>) =>
      apiRequest<MenuItemApiResponse>(`/vendors/${vendorId}/menus/${menuId}/items/${itemId}`, {
        method: 'PATCH',
        accessToken: token!,
        body: input,
      }).then(normalizeMenuItem),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ITEMS_KEY(vendorId, menuId) });
      qc.invalidateQueries({ queryKey: ITEM_KEY(vendorId, menuId, variables.itemId) });
      qc.invalidateQueries({ queryKey: ALLERGEN_REMEDIATION_KEY(vendorId) });
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
      apiRequest<MenuItemApiResponse>(
        `/vendors/${vendorId}/menus/${menuId}/items/${itemId}/availability`,
        {
          method: 'PATCH',
          accessToken: token!,
          body: { isAvailable },
        },
      ).then(normalizeMenuItem),
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
    mutationFn: async ({
      itemId,
      file,
    }: {
      itemId: string;
      file: File;
    }): Promise<UploadedImage> => {
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
