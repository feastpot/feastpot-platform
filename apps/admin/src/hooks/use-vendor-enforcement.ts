'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

export const URGENT_REASON_CODES: ReadonlyArray<ReasonCode> = [
  'FHRS_BELOW_THRESHOLD',
  'FOOD_SAFETY_CONCERN',
  'STRIPE_FLAG',
  'FRAUD',
];

export interface EnforcementAction {
  id: string;
  vendorId: string;
  actionType: EnforcementActionType;
  reasonCode: ReasonCode;
  reasonNarrative: string;
  facts: Record<string, unknown>;
  effectiveAt: string;
  noticeSentAt: string | null;
  urgentBasis: string | null;
  issuedBy: string;
  appealId: string | null;
  liftedAt: string | null;
  liftedBy: string | null;
  liftNote: string | null;
  createdAt: string;
}

export interface CreateEnforcementActionPayload {
  actionType: EnforcementActionType;
  reasonCode: ReasonCode;
  reasonNarrative: string;
  effectiveAt: string;
  urgentBasis?: string;
  facts?: Record<string, unknown>;
}

export function useVendorEnforcementActions(vendorId: string) {
  return useQuery({
    queryKey: ['vendor-enforcement', vendorId],
    queryFn: () =>
      apiRequest<EnforcementAction[]>(`/admin/vendors/${vendorId}/enforcement`, {
        next: { revalidate: 0 },
      }),
    enabled: Boolean(vendorId),
  });
}

export function useCreateEnforcementAction(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateEnforcementActionPayload) =>
      apiRequest<EnforcementAction>(`/admin/vendors/${vendorId}/enforcement`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendor-enforcement', vendorId] });
      void qc.invalidateQueries({ queryKey: ['vendor-detail', vendorId] });
    },
  });
}

export function useLiftEnforcementAction(vendorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ actionId, liftNote }: { actionId: string; liftNote?: string }) =>
      apiRequest<EnforcementAction>(
        `/admin/vendors/${vendorId}/enforcement/${actionId}/lift`,
        {
          method: 'PATCH',
          body: JSON.stringify({ liftNote }),
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendor-enforcement', vendorId] });
      void qc.invalidateQueries({ queryKey: ['vendor-detail', vendorId] });
    },
  });
}
