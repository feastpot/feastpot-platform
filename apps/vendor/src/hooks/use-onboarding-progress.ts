'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export interface OnboardingProgress {
  profileComplete: boolean;
  documentsComplete: boolean;
  stripeComplete: boolean;
  menuComplete: boolean;
  deliveryComplete: boolean;
  /** Count of currently-available menu items (menu step needs >= 3). */
  menuItemCount: number;
  allComplete: boolean;
  completedCount: number;
  totalSteps: number;
}

/**
 * Client-side view of GET /vendors/me/onboarding-progress. The welcome page
 * fetches this server-side; the onboarding wizard needs it client-side so the
 * "Add your first menu items" step can reflect real item counts.
 */
export function useOnboardingProgress() {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: ['vendor', 'onboarding-progress'],
    enabled: !!token && !loading,
    queryFn: () =>
      apiRequest<OnboardingProgress>('/vendors/me/onboarding-progress', {
        accessToken: token!,
      }),
  });
}
