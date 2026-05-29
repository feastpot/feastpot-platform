'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './use-api';

// Mirrors prisma's ModerationStatus enum. Menu items are created as either
// `auto_approved` (MENU_AUTO_APPROVE on) or `held` (gate on); admins then move
// them to `approved` / `rejected` (or back to `held`).
export type MenuModerationStatus = 'approved' | 'auto_approved' | 'rejected' | 'held';
export type MenuModerationFilter = MenuModerationStatus | 'all';

export interface MenuModerationRow {
  id: string;
  vendorId: string;
  menuId: string;
  name: string;
  description: string | null;
  category: string;
  pricePence: number;
  imageUrls: string[];
  moderationStatus: MenuModerationStatus;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
  vendor: {
    id: string;
    businessName: string;
    slug?: string;
    logoUrl?: string | null;
  };
}

export interface MenuModerationPage {
  data: MenuModerationRow[];
  total: number;
  nextCursor: string | null;
}

export interface MenuModerationFilters {
  status?: MenuModerationFilter;
  q?: string;
  vendorId?: string;
  cursor?: string | null;
  limit?: number;
}

export interface MenuModerationCounts {
  all: number;
  auto_approved: number;
  held: number;
  approved: number;
  rejected: number;
}

function toQueryString(f: MenuModerationFilters): string {
  const params = new URLSearchParams();
  if (f.status) params.set('status', f.status);
  if (f.q?.trim()) params.set('q', f.q.trim());
  if (f.vendorId) params.set('vendorId', f.vendorId);
  if (f.cursor) params.set('cursor', f.cursor);
  if (f.limit !== undefined) params.set('limit', String(f.limit));
  return params.toString();
}

export function useMenuModerationQueue(filters: MenuModerationFilters) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'menu-items', 'queue', filters],
    enabled: ready,
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
    queryFn: () => {
      const qs = toQueryString({ status: 'all', limit: 25, ...filters });
      return request<MenuModerationPage>(`/admin/menu-items/moderation-queue${qs ? `?${qs}` : ''}`);
    },
  });
}

export function useMenuModerationCounts(filters: Omit<MenuModerationFilters, 'status' | 'cursor' | 'limit'>) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'menu-items', 'queue', 'counts', filters],
    enabled: ready,
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
    queryFn: () => {
      const qs = toQueryString(filters);
      return request<MenuModerationCounts>(
        `/admin/menu-items/moderation-queue/counts${qs ? `?${qs}` : ''}`,
      );
    },
  });
}

export function useModerateMenuItem() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status: 'approved' | 'rejected' | 'held'; reason?: string }) =>
      request<MenuModerationRow>(`/admin/menu-items/${input.id}/moderation`, {
        method: 'PATCH',
        body: { status: input.status, reason: input.reason },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'menu-items', 'queue'] }),
  });
}
