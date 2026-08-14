'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export interface DeadLetterJob {
  id: string;
  queue: string;
  name: string;
  payload: Record<string, unknown>;
  failedReason: string | null;
  attemptsMade: number;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
}

interface DeadLetterListResponse {
  data: DeadLetterJob[];
  count: number;
}

export function useDeadLetterJobs(queue?: string) {
  const token = useAccessToken();
  const path = queue
    ? `/admin/dead-letters?queue=${encodeURIComponent(queue)}`
    : '/admin/dead-letters';
  return useQuery<DeadLetterListResponse>({
    queryKey: ['admin', 'dead-letters', queue ?? 'all'],
    queryFn: () => apiRequest<DeadLetterListResponse>(path, { accessToken: token! }),
    enabled: !!token,
    refetchInterval: 30_000,
  });
}

export function useRetryDeadLetterJob() {
  const token = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ queue, jobId }: { queue: string; jobId: string }) =>
      apiRequest(`/admin/dead-letters/${encodeURIComponent(queue)}/${encodeURIComponent(jobId)}/retry`, {
        method: 'POST',
        accessToken: token!,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'dead-letters'] }),
  });
}

export function useDiscardDeadLetterJob() {
  const token = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ queue, jobId }: { queue: string; jobId: string }) =>
      apiRequest(`/admin/dead-letters/${encodeURIComponent(queue)}/${encodeURIComponent(jobId)}/discard`, {
        method: 'POST',
        accessToken: token!,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'dead-letters'] }),
  });
}
