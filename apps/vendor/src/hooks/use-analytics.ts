'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export interface WeeklyRevenueBucket {
  weekStart: string;
  ordersCount: number;
  revenuePence: number;
}
export interface TopDish {
  menuItemId: string;
  name: string;
  ordersCount: number;
  unitsSold: number;
  revenuePence: number;
}
export interface HourlyBucket {
  hour: number;
  ordersCount: number;
}
export interface VendorAnalytics {
  weeklyRevenue: WeeklyRevenueBucket[];
  topDishes: TopDish[];
  hourlyDistribution: HourlyBucket[];
  averageOrderValuePence: number;
  reorderRatePct: number;
}

export function useAnalytics() {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: ['vendor', 'analytics'] as const,
    enabled: !!token && !loading,
    staleTime: 5 * 60_000,
    queryFn: () =>
      apiRequest<VendorAnalytics>('/vendors/me/analytics', { accessToken: token! }),
  });
}
