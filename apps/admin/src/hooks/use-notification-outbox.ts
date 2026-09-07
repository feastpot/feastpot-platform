'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export interface OutboxRow {
  id: string;
  eventName: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
  createdAt: string;
  jobId: string | null;
}

export function useDeadLetterOutbox(event?: string) {
  const token = useAccessToken();
  return useQuery<{ data: OutboxRow[]; count: number }>({
    queryKey: ['admin', 'outbox', 'dead-letters', event ?? 'all'],
    enabled: !!token,
    queryFn: () =>
      apiRequest(
        `/admin/notification-outbox/dead-letters${event ? `?event=${encodeURIComponent(event)}` : ''}`,
        {
          accessToken: token!,
        },
      ),
    refetchInterval: 30_000,
  });
}

export function useResendOutboxRow() {
  const token = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/admin/notification-outbox/${id}/resend`, {
        method: 'POST',
        accessToken: token!,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'outbox'] }),
  });
}

export function useDiscardOutboxRow() {
  const token = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/admin/notification-outbox/${id}/discard`, {
        method: 'POST',
        accessToken: token!,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'outbox'] }),
  });
}

export function useBulkOutboxRows() {
  const token = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, ids }: { action: 'resend' | 'discard'; ids: string[] }) =>
      apiRequest(`/admin/notification-outbox/bulk/${action}`, {
        method: 'POST',
        accessToken: token!,
        body: { ids, confirmed: true },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'outbox'] }),
  });
}
