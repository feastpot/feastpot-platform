'use client';

import { useMutation } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export interface StripeConnectSession {
  accountId: string;
  clientSecret: string;
  businessType: 'SOLE_TRADER' | 'LIMITED_COMPANY';
  payoutsEnabled: boolean;
}

export function useCreateStripeConnectSession() {
  const { token } = useAccessToken();
  return useMutation({
    mutationFn: (entityType?: 'SOLE_TRADER' | 'LIMITED_COMPANY') =>
      apiRequest<StripeConnectSession>('/vendors/me/stripe-connect-session', {
        method: 'POST',
        accessToken: token!,
        body: entityType ? { entityType } : undefined,
      }),
  });
}
