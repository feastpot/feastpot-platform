'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './use-api';

export type ModerationStatus = 'pending' | 'approved' | 'auto_approved' | 'rejected' | 'held';

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

export function useReviewsQueue() {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'reviews', 'queue'],
    enabled: ready,
    refetchInterval: 30_000,
    queryFn: () => request<ModerationQueuePage>('/reviews/moderation-queue?limit=50'),
  });
}

export function useModerateReview() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; status: 'approved' | 'rejected'; reason?: string }) =>
      request<ModerationQueueRow>(`/reviews/${input.id}/moderation`, {
        method: 'PATCH',
        body: { status: input.status, reason: input.reason },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'reviews', 'queue'] }),
  });
}
