'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './use-api';

export type FhrsStatus =
  | 'AWAITING_FIRST_INSPECTION'
  | 'RATED'
  | 'EXEMPT'
  | 'NOT_FOUND';

export type VerificationState = 'VERIFIED' | 'RENEWAL_DUE' | 'SUSPENDED';

export interface VendorVerificationRecord {
  id: string;
  vendorId: string;
  registrationNumber: string;
  registrationAuthority: string;
  registrationConfirmedAt: string;
  fhrsRating: number | null;
  fhrsRatingCheckedAt: string | null;
  fhrsInspectionStatus: FhrsStatus;
  insuranceProvider: string | null;
  insuranceValidUntil: string | null;
  allergenTrainingHeld: boolean;
  allergenTrainingUntil: string | null;
  idVerifiedAt: string | null;
  overallState: VerificationState;
  updatedAt: string;
}

export interface UpsertVerificationPayload {
  registrationNumber: string;
  registrationAuthority: string;
  registrationConfirmedAt: string;
  fhrsInspectionStatus: FhrsStatus;
  fhrsRating?: number | null;
  fhrsRatingCheckedAt?: string | null;
  insuranceProvider?: string | null;
  insuranceValidUntil?: string | null;
  allergenTrainingHeld: boolean;
  allergenTrainingUntil?: string | null;
  idVerifiedAt?: string | null;
  overallState: VerificationState;
}

export interface VerificationSummaryRow {
  vendorId: string;
  vendorName: string;
}

export interface VerificationSummaryRenewalRow extends VerificationSummaryRow {
  insuranceValidUntil: string | null;
  allergenTrainingUntil: string | null;
}

export interface VerificationSummary {
  counts: {
    notSetUp: number;
    renewalDue: number;
    suspended: number;
  };
  notSetUp: VerificationSummaryRow[];
  renewalDue: VerificationSummaryRenewalRow[];
  suspended: VerificationSummaryRow[];
}

export function useVerificationSummary() {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'compliance', 'verification-summary'],
    enabled: ready,
    queryFn: () => request<VerificationSummary>('/admin/vendors/verification-summary'),
  });
}

export function useVendorVerification(vendorId: string) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'vendor', vendorId, 'verification'],
    enabled: ready && Boolean(vendorId),
    queryFn: async () => {
      try {
        return await request<VendorVerificationRecord>(`/vendors/${vendorId}/verification`);
      } catch {
        // 404 means not yet created; return null rather than throwing.
        return null;
      }
    },
  });
}

export function useUpsertVerification(vendorId: string) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertVerificationPayload) =>
      request<VendorVerificationRecord>(`/admin/vendors/${vendorId}/verification`, {
        method: 'PUT',
        body: payload,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'vendor', vendorId, 'verification'] });
    },
  });
}
