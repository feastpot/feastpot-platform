'use client';

import { useQuery } from '@tanstack/react-query';

import { getLoyalty, getReferrals } from '@/lib/api/loyalty';
import { useAccessToken } from '@/lib/auth/use-access-token';

export function useLoyalty() {
  const { token } = useAccessToken();
  return useQuery({
    queryKey: ['loyalty'],
    queryFn: () => getLoyalty(token!),
    enabled: Boolean(token),
    staleTime: 60_000,
  });
}

export function useReferrals() {
  const { token } = useAccessToken();
  return useQuery({
    queryKey: ['referrals'],
    queryFn: () => getReferrals(token!),
    enabled: Boolean(token),
    staleTime: 60_000,
  });
}
