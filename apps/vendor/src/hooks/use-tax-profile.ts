'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

export type TaxEntityType = 'SOLE_TRADER' | 'LIMITED_COMPANY' | 'PARTNERSHIP';
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXEMPT';

export interface VendorTaxProfile {
  id: string;
  vendorId: string;
  entityType: TaxEntityType;
  legalName: string;
  tradingName: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  country: string;
  dateOfBirth: string | null;
  companyNumber: string | null;
  taxIdentifier: string | null;
  taxIdCountry: string;
  vatNumber: string | null;
  financialAccountId: string | null;
  accountHolderName: string | null;
  verificationStatus: VerificationStatus;
  verificationMethod: string | null;
  verifiedAt: string | null;
  lastReviewedAt: string | null;
  updatedAt: string;
}

export interface PlatformReport {
  id: string;
  reportingYear: number;
  vendorId: string;
  grossPence: number;
  feesPence: number;
  orderCount: number;
  quarterlyBreakdown: Record<string, { grossPence: number; feesPence: number; orderCount: number }>;
  reportedAt: string | null;
  copySentAt: string | null;
}

export interface UpsertTaxProfileInput {
  entityType: TaxEntityType;
  legalName: string;
  tradingName?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postcode: string;
  country?: string;
  dateOfBirth?: string;
  companyNumber?: string;
  taxIdentifier?: string;
  taxIdCountry?: string;
  vatNumber?: string;
}

export function useMyTaxProfile() {
  const { token, loading: authLoading } = useAccessToken();
  return useQuery({
    queryKey: ['vendor', 'tax-profile'],
    enabled: !!token && !authLoading,
    queryFn: () =>
      apiRequest<VendorTaxProfile | null>('/vendors/me/tax-profile', { accessToken: token! }),
    staleTime: 60_000,
  });
}

export function useUpsertTaxProfile() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpsertTaxProfileInput) =>
      apiRequest<VendorTaxProfile>('/vendors/me/tax-profile', {
        method: 'PUT',
        accessToken: token!,
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendor', 'tax-profile'] });
    },
  });
}

export function usePrefillFromStripe() {
  const { token } = useAccessToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiRequest<VendorTaxProfile>('/vendors/me/tax-profile/from-stripe', {
        method: 'POST',
        accessToken: token!,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendor', 'tax-profile'] });
    },
  });
}

export function useMyReports() {
  const { token, loading: authLoading } = useAccessToken();
  return useQuery({
    queryKey: ['vendor', 'platform-reports'],
    enabled: !!token && !authLoading,
    queryFn: () => apiRequest<PlatformReport[]>('/vendors/me/reports', { accessToken: token! }),
    staleTime: 300_000,
  });
}
