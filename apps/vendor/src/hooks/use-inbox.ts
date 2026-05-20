'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

/**
 * T007: vendor in-app inbox hooks.
 *
 * The list query is cursor-paginated; the unread-count is polled at a
 * gentle interval (60s) so the top-nav badge stays roughly fresh without
 * hammering the API.
 */
export interface InboxNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface InboxPage {
  data: InboxNotification[];
  nextCursor: string | null;
}

const KEY_LIST = ['vendor', 'inbox', 'list'] as const;
const KEY_COUNT = ['vendor', 'inbox', 'unread-count'] as const;

export function useInboxList(opts?: { unreadOnly?: boolean }) {
  const { token, loading } = useAccessToken();
  const qs = opts?.unreadOnly ? '?unreadOnly=true' : '';
  return useQuery({
    queryKey: [...KEY_LIST, opts?.unreadOnly ?? false],
    enabled: !!token && !loading,
    queryFn: () => apiRequest<InboxPage>(`/inbox${qs}`, { accessToken: token! }),
  });
}

export function useInboxUnreadCount() {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: KEY_COUNT,
    enabled: !!token && !loading,
    queryFn: () => apiRequest<{ count: number }>('/inbox/unread-count', { accessToken: token! }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useMarkInboxRead() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiRequest<InboxNotification>(`/inbox/${id}/read`, {
        method: 'PATCH',
        accessToken: token!,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_LIST });
      qc.invalidateQueries({ queryKey: KEY_COUNT });
    },
  });
}

export function useMarkAllInboxRead() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<{ updated: number }>('/inbox/read-all', { method: 'POST', accessToken: token! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY_LIST });
      qc.invalidateQueries({ queryKey: KEY_COUNT });
    },
  });
}
