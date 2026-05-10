'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export interface VendorStats {
  today: { orders: number; revenuePence: number };
  week: { orders: number; revenuePence: number };
  pendingNow: number;
}

export function useVendorStats() {
  const { token, loading: authLoading } = useAccessToken();

  return useQuery({
    queryKey: ['vendor', 'stats'],
    enabled: !!token && !authLoading,
    refetchInterval: 60_000,
    queryFn: () =>
      apiRequest<VendorStats>('/vendors/me/stats', { accessToken: token! }),
  });
}
