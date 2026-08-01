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

export type TrustSignalType =
  | 'food_business_registration'
  | 'hygiene_rating'
  | 'identity_check'
  | 'allergen_information'
  | 'delivery_coverage'
  | 'event_catering_experience'
  | 'reliable_orders';

export type TrustSignalStatus = 'not_provided' | 'submitted' | 'verified' | 'expired';

export interface VendorTrustSignal {
  id: string | null;
  vendorId: string;
  signalType: TrustSignalType;
  status: TrustSignalStatus;
  evidenceReference: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  updatedAt: string | null;
}

export function useVendorTrustSignals(vendorId: string) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'vendor', vendorId, 'trust-signals'],
    enabled: ready && Boolean(vendorId),
    queryFn: () => request<VendorTrustSignal[]>(`/admin/vendors/${vendorId}/trust-signals`),
  });
}

export function useUpdateTrustSignal(vendorId: string) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      signalType,
      status,
      evidenceReference,
    }: {
      signalType: TrustSignalType;
      status: 'verified' | 'expired';
      evidenceReference?: string;
    }) =>
      request(`/admin/vendors/${vendorId}/trust-signals/${signalType}`, {
        method: 'PATCH',
        body: { status, ...(evidenceReference !== undefined ? { evidenceReference } : {}) },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'vendor', vendorId, 'trust-signals'] });
    },
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
