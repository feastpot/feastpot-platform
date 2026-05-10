'use client';

import { useQuery } from '@tanstack/react-query';

import { useApi } from './use-api';

export interface DailyRevenueBucket {
  date: string;
  gmvPence: number;
  ordersCount: number;
}

export interface TopVendorRow {
  vendorId: string;
  businessName: string;
  gmvPence: number;
  ordersCount: number;
  rating: number;
  disputeRatePct: number;
}

export interface AdminDashboard {
  gmvTodayPence: number;
  gmvWeekPence: number;
  gmvMonthPence: number;
  activeVendors: number;
  ordersToday: number;
  ordersTodayCount: number;
  avgBasketPence: number;
  repeatOrderRatePct: number;
  dailyRevenue: DailyRevenueBucket[];
  topVendors: TopVendorRow[];
}

export function useAdminDashboard() {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    enabled: ready,
    queryFn: () => request<AdminDashboard>('/admin/dashboard'),
  });
}
