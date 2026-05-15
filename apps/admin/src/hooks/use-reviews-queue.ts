'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './use-api';

// Mirrors prisma's ModerationStatus enum (auto_approved/held/approved/rejected).
// Note: there is no 'pending' state in the schema — auto-moderate always
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
  vendor: { id: string; businessName: string };
}

export interface ModerationQueuePage {
  data: ModerationQueueRow[];
  nextCursor: string | null;
}

export function useReviewsQueue(filter: ModerationQueueFilter = 'all') {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'reviews', 'queue', filter],
    enabled: ready,
    refetchInterval: 30_000,
    queryFn: () => {
      const params = new URLSearchParams({ limit: '50', status: filter });
      return request<ModerationQueuePage>(`/reviews/moderation-queue?${params.toString()}`);
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
