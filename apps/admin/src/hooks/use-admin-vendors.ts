'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './use-api';

export type VendorStatus = 'pending' | 'approved' | 'live' | 'suspended' | 'probation' | 'removed';
export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'expired';
export type DocumentType = 'hygiene_cert' | 'insurance' | 'photo_id' | 'bank_details' | 'kitchen_reg';

export interface AdminVendorRow {
  id: string;
  businessName: string;
  slug: string;
  cuisines: string[];
  status: VendorStatus;
  rating: number;
  ratingCount: number;
  commissionBps: number;
  payoutsEnabled: boolean;
  createdAt: string;
  approvedAt: string | null;
  owner: { firstName: string | null; lastName: string | null; email: string };
  documentStatusByType: Partial<Record<DocumentType, DocumentStatus>>;
}

export interface AdminVendorsPage {
  data: AdminVendorRow[];
  nextCursor: string | null;
}

export function useAdminVendors(status: VendorStatus | 'all') {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'vendors', status],
    enabled: ready,
    queryFn: () => {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      params.set('limit', '50');
      return request<AdminVendorsPage>(`/admin/vendors?${params.toString()}`);
    },
  });
}

export function useUpdateVendorStatus(vendorId: string) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { status: VendorStatus; reasonCode?: string; notes?: string }) =>
      request(`/vendors/${vendorId}/status`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'vendors'] });
      qc.invalidateQueries({ queryKey: ['admin', 'vendor', vendorId] });
    },
  });
}
