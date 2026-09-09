'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export interface OnboardingProgress {
  vendorId: string;
  canProgress: boolean;
  canProfileGoLive: boolean;
  blockingProgress: OnboardingStep[];
  blockingPublication: OnboardingStep[];
  steps: OnboardingStep[];
}

export type OnboardingStepState =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'verified'
  | 'rejected';

export interface OnboardingStep {
  name: string;
  label: string;
  state: OnboardingStepState;
  complete: boolean;
  blocksProgress: boolean;
  blocksPublication: boolean;
  sourceCitation: string;
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
