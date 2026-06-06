'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationPreference,
  type PreferenceUpdate,
} from '@/lib/api/notification-preferences';
import { useAccessToken } from '@/lib/auth/use-access-token';

const PREFS_KEY = ['notification-preferences'] as const;

export function useNotificationPreferences() {
  const { token } = useAccessToken();
  return useQuery<NotificationPreference[]>({
    queryKey: PREFS_KEY,
    queryFn: () => getNotificationPreferences(token!),
    enabled: Boolean(token),
    staleTime: 60_000,
  });
}

export function useUpdateNotificationPreferences() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (updates: PreferenceUpdate[]) => {
      if (!token) throw new Error('Not signed in');
      return updateNotificationPreferences(updates, token);
    },
    onSuccess: (next) => {
      qc.setQueryData(PREFS_KEY, next);
    },
  });
}
