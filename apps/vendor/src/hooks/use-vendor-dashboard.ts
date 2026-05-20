'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export interface DashboardOrderDue {
  id: string;
  code: string;
  customerName: string;
  status: string;
  deliveryType: string;
  scheduledFor: string | null;
  itemCount: number;
  totalPence: number;
}

export interface DashboardUpcomingOrder {
  id: string;
  code: string;
  customerName: string;
  status: string;
  scheduledFor: string | null;
  totalPence: number;
}

export interface DashboardEventEnquiries {
  pending: number;
  nextEventDate: string | null;
}

export interface DashboardNextPayout {
  expectedDate: string | null;
  amountPence: number;
  state: 'accruing' | 'pending_approval' | 'approved' | 'transferring';
  orderCount: number;
}

export interface DashboardMenuWarningItem {
  id: string;
  name: string;
  issues: Array<'no_image' | 'no_allergens'>;
}

export interface DashboardMenuHealth {
  missingImages: number;
  missingAllergens: number;
  items: DashboardMenuWarningItem[];
}

export interface VendorDashboardSummary {
  ordersDueToday: DashboardOrderDue[];
  upcomingOrders: DashboardUpcomingOrder[];
  eventEnquiries: DashboardEventEnquiries;
  nextPayout: DashboardNextPayout | null;
  menuHealth: DashboardMenuHealth;
}

/**
 * Single round-trip backing the dashboard panels added in T004. 60s poll
 * mirrors the stats hook so the home screen feels live without hammering
 * the API.
 */
export function useVendorDashboard() {
  const { token, loading: authLoading } = useAccessToken();

  return useQuery({
    queryKey: ['vendor', 'dashboard'],
    enabled: !!token && !authLoading,
    refetchInterval: 60_000,
    queryFn: () =>
      apiRequest<VendorDashboardSummary>('/vendors/me/dashboard', {
        accessToken: token!,
      }),
  });
}
