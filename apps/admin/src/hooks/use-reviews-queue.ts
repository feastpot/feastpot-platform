'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './use-api';

// Mirrors prisma's ModerationStatus enum (auto_approved/held/approved/rejected).
// Note: there is no 'pending' state in the schema - auto-moderate always
// returns either auto_approved or held on review create.
export type ModerationStatus = 'approved' | 'auto_approved' | 'rejected' | 'held';
export type ModerationQueueFilter = ModerationStatus | 'all';

export interface ModerationQueueRow {
  id: string;
  orderId: string;
  vendorId: string;
  customerId: string;
  rating: number;
  title: string | null;
  body: string | null;
  isVerified: boolean;
  isHidden: boolean;
  moderationStatus: ModerationStatus;
  moderatedById: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // vendor/customer fields beyond id+businessName/email are only present on
  // API versions ≥ the moderation-queue rebuild — keep them optional so an
  // older deployed API doesn't crash the client.
  vendor: {
    id: string;
    businessName: string;
    slug?: string;
    logoUrl?: string | null;
    cuisines?: string[];
  };
  customer: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string;
  };
}

export interface ModerationQueuePage {
  data: ModerationQueueRow[];
  total: number;
  nextCursor: string | null;
}

export interface ModerationQueueFilters {
  status?: ModerationQueueFilter;
  q?: string;
  vendorId?: string;
  rating?: number;
  submittedFrom?: string;
  submittedTo?: string;
  cursor?: string | null;
  limit?: number;
}

export interface ModerationQueueCounts {
  all: number;
  auto_approved: number;
  held: number;
  approved: number;
  rejected: number;
}

function toQueryString(f: ModerationQueueFilters): string {
  const params = new URLSearchParams();
  if (f.status) params.set('status', f.status);
  if (f.q?.trim()) params.set('q', f.q.trim());
  if (f.vendorId) params.set('vendorId', f.vendorId);
  if (f.rating !== undefined) params.set('rating', String(f.rating));
  if (f.submittedFrom) params.set('submittedFrom', f.submittedFrom);
  if (f.submittedTo) params.set('submittedTo', f.submittedTo);
  if (f.cursor) params.set('cursor', f.cursor);
  if (f.limit !== undefined) params.set('limit', String(f.limit));
  return params.toString();
}

export function useReviewsQueue(filters: ModerationQueueFilters) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'reviews', 'queue', filters],
    enabled: ready,
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
    queryFn: () => {
      const qs = toQueryString({ status: 'all', limit: 25, ...filters });
      return request<ModerationQueuePage>(`/reviews/moderation-queue${qs ? `?${qs}` : ''}`);
    },
  });
}

/**
 * Status counts for the quick-filter chips. Mirrors the same filter set as
 * the list (so chips re-count after search / vendor / rating filters).
 * Server strips the `status` param itself before grouping.
 */
export function useReviewsQueueCounts(filters: Omit<ModerationQueueFilters, 'status' | 'cursor' | 'limit'>) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'reviews', 'queue', 'counts', filters],
    enabled: ready,
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
    queryFn: () => {
      const qs = toQueryString(filters);
      return request<ModerationQueueCounts>(
        `/reviews/moderation-queue/counts${qs ? `?${qs}` : ''}`,
      );
    },
  });
}

export function useModerateReview() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    // D19: 'held' is a valid transition now (admin can re-flag a released review).
    mutationFn: (input: { id: string; status: 'approved' | 'rejected' | 'held'; reason?: string }) =>
      request<ModerationQueueRow>(`/reviews/${input.id}/moderation`, {
        method: 'PATCH',
        body: { status: input.status, reason: input.reason },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'reviews', 'queue'] }),
  });
}
