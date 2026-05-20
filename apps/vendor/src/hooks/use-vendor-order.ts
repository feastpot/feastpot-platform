'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

import type { VendorOrderStatus } from './use-vendor-orders';

export interface VendorOrderItemDetail {
  id: string;
  menuItemId: string;
  nameSnapshot: string;
  quantity: number;
  unitPence: number;
  totalPence: number;
  notes?: string | null;
  menuItem?: {
    allergens?: string[] | null;
    category?: string | null;
  } | null;
}

export interface VendorOrderAddress {
  id: string;
  label?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  postcode: string;
  country?: string | null;
}

export interface VendorOrderCustomerDetail {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface VendorOrderDisputeSummary {
  id: string;
  status: string;
  issueType: string;
  severity: string;
  description: string;
  createdAt: string;
}

export interface VendorOrderAmendment {
  id: string;
  proposedChange: string;
  priceDeltaPence: number | null;
  status: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface VendorOrderDetail {
  id: string;
  orderNumber: string;
  status: VendorOrderStatus;
  type: 'standard' | 'event' | 'subscription';
  deliveryType: string;
  customerId: string;
  vendorId: string;
  subtotalPence: number;
  deliveryFeePence: number;
  serviceFeePence: number;
  discountPence: number;
  totalPence: number;
  commissionPence: number;
  vendorPayoutPence: number;
  notes?: string | null;
  scheduledFor?: string | null;
  etaMinutes?: number | null;
  etaAt?: string | null;
  acceptedAt?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  createdAt: string;
  customer?: VendorOrderCustomerDetail | null;
  address?: VendorOrderAddress | null;
  items: VendorOrderItemDetail[];
  amendments?: VendorOrderAmendment[];
  disputes?: VendorOrderDisputeSummary[];
}

export function useVendorOrder(id: string | undefined) {
  const { token, loading: authLoading } = useAccessToken();

  return useQuery({
    queryKey: ['vendor', 'order', id],
    enabled: !!token && !authLoading && !!id,
    refetchInterval: 30_000,
    queryFn: () =>
      apiRequest<VendorOrderDetail>(`/orders/${id}`, {
        accessToken: token!,
      }),
  });
}
