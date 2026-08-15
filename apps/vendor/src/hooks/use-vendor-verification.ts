'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export type VerificationOverallState = 'VERIFIED' | 'RENEWAL_DUE' | 'SUSPENDED';
export type FhrsInspectionStatus = 'RATED' | 'AWAITING_FIRST_INSPECTION' | 'EXEMPT' | 'NOT_FOUND';

export interface VendorVerificationRecord {
  id: string;
  vendorId: string;
  registrationNumber: string;
  registrationAuthority: string;
  registrationConfirmedAt: string;
  fhrsRating: number | null;
  fhrsRatingCheckedAt: string | null;
  fhrsInspectionStatus: FhrsInspectionStatus;
  insuranceProvider: string | null;
  insuranceValidUntil: string | null;
  allergenTrainingHeld: boolean;
  allergenTrainingUntil: string | null;
  idVerifiedAt: string | null;
  overallState: VerificationOverallState;
  updatedAt: string;
}

const KEY = (vendorId: string) => ['vendor', 'verification', vendorId] as const;

/**
 * Fetches the VendorVerification record for the current vendor.
 *
 * Used by VerificationStateBanner on the dashboard to read overallState and
 * derive which documents are blocking the listing -- independently of the
 * document-status hook used by ComplianceAlerts.
 */
export function useVendorVerification(vendorId: string | undefined) {
  const { token, loading } = useAccessToken();
  return useQuery({
    queryKey: KEY(vendorId ?? ''),
    enabled: !!vendorId && !!token && !loading,
    staleTime: 60_000,
    queryFn: () =>
      apiRequest<VendorVerificationRecord>(`/vendors/${vendorId}/verification`, {
        accessToken: token!,
      }),
  });
}
