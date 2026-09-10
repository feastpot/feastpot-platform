'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export type RequiredOnboardingItemName =
  | 'food_business_registration'
  | 'fhrs_eligibility'
  | 'public_liability_insurance'
  | 'food_safety_certificate'
  | 'photo_id_verification';
export type RequiredOnboardingItemState = 'deferred' | 'outstanding';
export type RequiredOnboardingItemResponseState = RequiredOnboardingItemState | 'supplied';

export interface RequiredOnboardingItem {
  id: string;
  vendorId: string;
  name: RequiredOnboardingItemName;
  state: RequiredOnboardingItemResponseState;
  suppliedAt: string | null;
  deferredAt: string | null;
}

const KEY = ['vendor', 'required-onboarding-items'] as const;

export function useRequiredOnboardingItems() {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: KEY,
    enabled: !!token && !loading,
    queryFn: () =>
      apiRequest<RequiredOnboardingItem[]>('/vendors/me/required-onboarding-items', {
        accessToken: token!,
      }),
  });
}

export function useUpdateRequiredOnboardingItem() {
  const { token } = useAccessToken();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: RequiredOnboardingItemName; state: RequiredOnboardingItemState }) =>
      apiRequest<RequiredOnboardingItem>('/vendors/me/required-onboarding-items', {
        method: 'PUT',
        accessToken: token!,
        body: input,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ['vendor', 'onboarding-progress'] });
    },
  });
}
