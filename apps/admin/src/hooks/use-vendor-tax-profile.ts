import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from '@/hooks/use-api';

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
  verifiedById: string | null;
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
  vendor: { businessName: string; status: string };
}

export function useVendorTaxProfile(vendorId: string) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'vendor', vendorId, 'tax-profile'],
    enabled: ready && Boolean(vendorId),
    queryFn: () => request<VendorTaxProfile | null>(`/admin/vendors/${vendorId}/tax-profile`),
  });
}

export function useVerifyTaxProfile(vendorId: string) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { status: VerificationStatus; verificationMethod: string; note?: string }) =>
      request<VendorTaxProfile>(`/admin/vendors/${vendorId}/tax-profile/verify`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'vendor', vendorId, 'tax-profile'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'vendor', vendorId] });
    },
  });
}

export function usePlatformReports(year: number) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'platform-reports', year],
    enabled: ready,
    queryFn: () => request<PlatformReport[]>(`/admin/platform-reports?year=${year}`),
  });
}

export function useGenerateReport() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (year: number) =>
      request<{ vendorsProcessed: number; rowsUpserted: number }>(
        `/admin/platform-reports/generate?year=${year}`,
        { method: 'POST' },
      ),
    onSuccess: (_, year) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'platform-reports', year] });
    },
  });
}

export function useSendCopies() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (year: number) =>
      request<{ sent: number; skipped: number }>(
        `/admin/platform-reports/send-copies?year=${year}`,
        { method: 'POST' },
      ),
    onSuccess: (_, year) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'platform-reports', year] });
    },
  });
}
