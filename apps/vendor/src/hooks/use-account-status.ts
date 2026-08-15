'use client';

import { useQuery } from '@tanstack/react-query';

import { useAccessToken } from '@/lib/auth/use-access-token';
import { apiRequest } from '@/lib/api/client';

export type EnforcementActionType = 'RESTRICTION' | 'SUSPENSION' | 'TERMINATION';

export type ReasonCode =
  | 'FHRS_BELOW_THRESHOLD'
  | 'DOCUMENT_EXPIRED'
  | 'FOOD_SAFETY_CONCERN'
  | 'MATERIAL_BREACH'
  | 'REPEATED_COMPLAINTS'
  | 'STRIPE_FLAG'
  | 'PROHIBITED_CONDUCT'
  | 'FRAUD';

export interface EnforcementAction {
  id: string;
  vendorId: string;
  actionType: EnforcementActionType;
  reasonCode: ReasonCode;
  reasonNarrative: string;
  facts: Record<string, unknown>;
  effectiveAt: string;
  noticeSentAt: string | null;
  liftedAt: string | null;
  createdAt: string;
}

export const REASON_CODE_LABELS: Record<ReasonCode, string> = {
  FHRS_BELOW_THRESHOLD: 'FHRS hygiene rating below threshold',
  DOCUMENT_EXPIRED: 'Compliance document expired',
  FOOD_SAFETY_CONCERN: 'Food safety concern',
  MATERIAL_BREACH: 'Material breach of terms',
  REPEATED_COMPLAINTS: 'Repeated customer complaints',
  STRIPE_FLAG: 'Payment account flagged',
  PROHIBITED_CONDUCT: 'Prohibited conduct',
  FRAUD: 'Fraud or misrepresentation',
};

export const REASON_CODE_RESOLVE_STEPS: Record<ReasonCode, string> = {
  FHRS_BELOW_THRESHOLD:
    'Contact your local authority to arrange a re-inspection and achieve a minimum rating of 3/5. Upload evidence and contact support once confirmed.',
  DOCUMENT_EXPIRED:
    'Upload your renewed compliance documents in the vendor portal under Compliance and Documents.',
  FOOD_SAFETY_CONCERN:
    'Contact Feastpot support immediately to discuss the concern and the steps required to resume trading.',
  MATERIAL_BREACH: 'Review the notice details and contact support to discuss remediation steps.',
  REPEATED_COMPLAINTS:
    'Review the complaint summaries in your disputes history and contact support to discuss remediation.',
  STRIPE_FLAG:
    'Log in to your Stripe dashboard to resolve any outstanding requirements, then contact Feastpot support.',
  PROHIBITED_CONDUCT: 'Contact Feastpot support to discuss this notice.',
  FRAUD: 'Contact Feastpot support immediately. You may also seek independent legal advice.',
};

export function useAccountStatus() {
  const { token, loading: tokenLoading } = useAccessToken();
  return useQuery({
    queryKey: ['account-status', token],
    queryFn: () =>
      apiRequest<EnforcementAction[]>('/vendors/me/enforcement', {
        accessToken: token ?? undefined,
        next: { revalidate: 0 },
      }),
    // Don't attempt the request until we have a token.
    enabled: !tokenLoading && !!token,
    staleTime: 30_000,
    retry: 1,
  });
}
