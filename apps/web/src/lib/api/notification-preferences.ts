import { apiRequest } from './client';

/**
 * Mirrors the GET/PATCH /v1/notification-preferences response from
 * `apps/api/src/modules/notifications/notification-preferences.service.ts`.
 */
export interface NotificationPreference {
  key: string;
  channel: string;
  groupLabel: string;
  channelLabel: string;
  enabled: boolean;
  /** false => transactional channel the user cannot turn off. */
  canDisable: boolean;
}

export interface PreferenceUpdate {
  channel: string;
  key: string;
  enabled: boolean;
}

export function getNotificationPreferences(accessToken: string): Promise<NotificationPreference[]> {
  return apiRequest<NotificationPreference[]>('/notification-preferences', { accessToken });
}

export function updateNotificationPreferences(
  updates: PreferenceUpdate[],
  accessToken: string,
): Promise<NotificationPreference[]> {
  return apiRequest<NotificationPreference[]>('/notification-preferences', {
    method: 'PATCH',
    body: { preferences: updates },
    accessToken,
  });
}
