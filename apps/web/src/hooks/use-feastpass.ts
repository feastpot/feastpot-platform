'use client';

import { useQuery } from '@tanstack/react-query';

import { useAccessToken } from '@/lib/auth/use-access-token';
import {
  getFeastPassMembership,
  getSavingsPotential,
} from '@/lib/api/feastpass';

const FEASTPASS_KEY = 'feastpass';

/** Current membership status + cumulative savings. Used on /account/feastpass. */
export function useFeastPassMembership() {
  const { token } = useAccessToken();
  return useQuery({
    queryKey: [FEASTPASS_KEY, 'membership'],
    queryFn: () => getFeastPassMembership(token!),
    enabled: Boolean(token),
    staleTime: 60_000,
  });
}

/**
 * How much the customer would have saved with FeastPass across their past
 * orders. Returns 0 / orderCount=0 immediately for active members (server
 * short-circuits). Used by the account-page savings banner and the
 * post-checkout callout.
 */
export function useSavingsPotential() {
  const { token } = useAccessToken();
  return useQuery({
    queryKey: [FEASTPASS_KEY, 'savings-potential'],
    queryFn: () => getSavingsPotential(token!),
    enabled: Boolean(token),
    staleTime: 5 * 60_000,
  });
}
