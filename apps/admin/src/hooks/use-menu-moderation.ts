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
  submissionVersion: number;
  isAvailable: boolean;
  createdAt: string;
  updatedAt: string;
  moderationReason?: string | null;
  moderationSubmittedAt?: string | null;
  moderatedAt?: string | null;
  slaDueAt?: string | null;
  isOverdue?: boolean;
  vendor: {
    id: string;
    businessName: string;
    slug?: string;
    logoUrl?: string | null;
  };
}

interface MenuModerationApiRow extends MenuModerationRow {
  decisionReason?: string | null;
  submittedAt?: string | null;
  decidedAt?: string | null;
  moderationSla?: {
    submittedAt: string;
    slaDueAt: string;
    overdue: boolean;
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
      return request<Omit<MenuModerationPage, 'data'> & { data: MenuModerationApiRow[] }>(
        `/admin/menu-items/moderation-queue${qs ? `?${qs}` : ''}`,
      ).then((page) => ({
        ...page,
        data: page.data.map((row) => ({
          ...row,
          moderationReason: row.decisionReason ?? null,
          moderationSubmittedAt: row.moderationSla?.submittedAt ?? row.submittedAt ?? null,
          moderatedAt: row.decidedAt ?? null,
          slaDueAt: row.moderationSla?.slaDueAt ?? null,
          isOverdue: row.moderationSla?.overdue ?? false,
        })),
      }));
    },
  });
}

export function useMenuModerationCounts(
  filters: Omit<MenuModerationFilters, 'status' | 'cursor' | 'limit'>,
) {
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
    mutationFn: (input: {
      id: string;
      expectedSubmissionVersion: number;
      expectedStatus: MenuModerationStatus;
      status: 'approved' | 'rejected' | 'held';
      reason?: string;
      edits?: { name?: string; description?: string; category?: string; basePricePence?: number };
    }) => {
      if (input.status === 'approved' && input.edits && Object.keys(input.edits).length > 0) {
        return request<MenuModerationRow>(`/admin/menu-items/${input.id}/approve-with-edit`, {
          method: 'PATCH',
          body: { edit: input.edits, expectedSubmissionVersion: input.expectedSubmissionVersion },
        });
      }
      return request<MenuModerationRow>(`/admin/menu-items/${input.id}/moderation`, {
        method: 'PATCH',
        body: {
          status: input.status,
          reason: input.reason,
          expectedSubmissionVersion: input.expectedSubmissionVersion,
          expectedStatus: input.expectedStatus,
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'menu-items', 'queue'] }),
  });
}

export function useBulkApproveMenuItems() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      vendorId: string;
      items: Array<{ id: string; expectedSubmissionVersion: number }>;
    }) =>
      request<{ approvedCount: number }>(
        `/admin/menu-items/moderation-queue/vendors/${input.vendorId}/approve`,
        {
          method: 'PATCH',
          body: { items: input.items },
        },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'menu-items', 'queue'] }),
  });
}
