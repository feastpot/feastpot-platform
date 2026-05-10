'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { DocumentStatus, DocumentType, VendorStatus } from './use-admin-vendors';
import { useApi } from './use-api';

export interface VendorDetail {
  id: string;
  businessName: string;
  slug: string;
  description: string | null;
  cuisines: string[];
  status: VendorStatus;
  rating: number;
  ratingCount: number;
  commissionBps: number;
  payoutsEnabled: boolean;
  stripeAccountId: string | null;
  createdAt: string;
  approvedAt: string | null;
  suspendedAt: string | null;
}

export interface VendorDocument {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  fileUrl: string;
  fileName: string;
  expiresAt: string | null;
  rejectReason: string | null;
  verifiedAt: string | null;
  uploadedAt: string;
}

export function useVendorDetail(vendorId: string) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'vendor', vendorId],
    enabled: ready && Boolean(vendorId),
    queryFn: () => request<VendorDetail>(`/vendors/${vendorId}`),
  });
}

export function useVendorDocuments(vendorId: string) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'vendor', vendorId, 'documents'],
    enabled: ready && Boolean(vendorId),
    queryFn: () => request<VendorDocument[]>(`/vendors/${vendorId}/documents`),
  });
}

export function useVerifyDocument(vendorId: string) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentId,
      status,
      rejectReason,
    }: {
      documentId: string;
      status: 'verified' | 'rejected';
      rejectReason?: string;
    }) =>
      request(`/vendors/${vendorId}/documents/${documentId}/verify`, {
        method: 'PATCH',
        body: { status, rejectReason },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'vendor', vendorId, 'documents'] });
      qc.invalidateQueries({ queryKey: ['admin', 'vendors'] });
    },
  });
}
