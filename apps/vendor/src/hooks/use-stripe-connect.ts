'use client';

import { useMutation } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export interface StripeConnectLink {
  url: string;
  accountId: string;
}

export function useCreateStripeConnectLink() {
  const { token } = useAccessToken();
  return useMutation({
    mutationFn: () =>
      apiRequest<StripeConnectLink>('/vendors/me/stripe-connect-link', {
        method: 'POST',
        accessToken: token!,
      }),
  });
}
