'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './use-api';

export type FhrsStatus = 'AWAITING_FIRST_INSPECTION' | 'RATED' | 'EXEMPT' | 'NOT_FOUND';

/**
 * Every VerificationState value from the Prisma enum, plus NOT_SET_UP which
 * represents live/probation vendors with no VendorVerification record at all.
 * Read from the API response -- not hardcoded here -- so adding a new Prisma
 * enum value automatically flows through to the admin UI.
 */
export type VerificationOverallState = 'NOT_SET_UP' | 'VERIFIED' | 'RENEWAL_DUE' | 'SUSPENDED';

/**
 * The Prisma VerificationState enum values only (excludes NOT_SET_UP which is
 * a frontend-only sentinel). Used for record-level fields like overallState
 * on VendorVerificationRecord and UpsertVerificationPayload.
 */
export type VerificationState = Exclude<VerificationOverallState, 'NOT_SET_UP'>;

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
  overallState: Exclude<VerificationOverallState, 'NOT_SET_UP'>;
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
  overallState: Exclude<VerificationOverallState, 'NOT_SET_UP'>;
}

/**
 * One row in the verification summary -- one per live/probation vendor.
 * Covers every vendor including VERIFIED, ensuring counts reconcile to the
 * total live-vendor population.
 */
export interface VerificationSummaryRow {
  vendorId: string;
  vendorName: string;
  overallState: VerificationOverallState;
  insuranceValidUntil: string | null;
  allergenTrainingUntil: string | null;
  lastNotifiedState: string | null;
  lastNotifiedAt: string | null;
}

/**
 * Verification summary response.
 *
 * Invariant guaranteed by the API:
 *   counts.notSetUp + counts.VERIFIED + counts.RENEWAL_DUE + counts.SUSPENDED
 *     === totalVendors
 *
 * The UI renders this equation on screen so admins can confirm counts
 * reconcile without opening a database client.
 */
export interface VerificationSummary {
  totalVendors: number;
  counts: {
    notSetUp: number;
    VERIFIED: number;
    RENEWAL_DUE: number;
    SUSPENDED: number;
  };
  rows: VerificationSummaryRow[];
}

export function useVerificationSummary() {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'compliance', 'verification-summary'],
    enabled: ready,
    staleTime: 30_000,
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
      void qc.invalidateQueries({ queryKey: ['admin', 'vendor', vendorId, 'verification'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'compliance', 'verification-summary'] });
    },
  });
}
