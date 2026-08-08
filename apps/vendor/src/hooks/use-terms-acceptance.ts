'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

interface AcceptanceStatus {
  accepted: boolean;
}

/**
 * Check whether this vendor has accepted the current live Vendor Terms.
 * Calls GET /v1/terms/acceptance-status. Used by the onboarding wizard
 * to gate the "can go live" check and show the terms step.
 */
export function useTermsAcceptanceStatus() {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: ['vendor', 'terms-acceptance-status'],
    enabled: !!token && !loading,
    queryFn: () =>
      apiRequest<AcceptanceStatus>('/terms/acceptance-status', {
        accessToken: token!,
      }),
  });
}
