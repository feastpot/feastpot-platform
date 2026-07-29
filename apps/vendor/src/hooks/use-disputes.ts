'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';
import { API_URL } from '@/lib/env';

export type DisputeStatus = 'open' | 'vendor_contacted' | 'escalated' | 'resolved' | 'closed';

export type DisputeIssueType =
  | 'not_delivered'
  | 'missing_items'
  | 'wrong_order'
  | 'quality'
  | 'other';

export type DisputeSeverity = 'low' | 'medium' | 'high';

export type EvidenceType = 'photo' | 'document' | 'screenshot';

export interface DisputeEvidence {
  id: string;
  disputeId: string;
  type: EvidenceType;
  fileUrl: string;
  caption: string | null;
  uploadedBy: string;
  createdAt: string;
}

/**
 * The order relation the API embeds on a dispute. The list endpoint selects a
 * lean subset; the detail endpoint includes the full order plus vendor/customer.
 * Typed loosely for the fields the UI doesn't render.
 */
export interface DisputeOrder {
  id: string;
  orderNumber: string;
  totalPence: number;
  vendorId?: string;
  [key: string]: unknown;
}

export interface Dispute {
  id: string;
  orderId: string;
  raisedById: string;
  issueType: DisputeIssueType;
  severity: DisputeSeverity;
  status: DisputeStatus;
  description: string;
  vendorResponse: string | null;
  vendorRespondedAt: string | null;
  resolution: string | null;
  resolutionNote: string | null;
  createdAt: string;
  order: DisputeOrder;
}

/** Detail response includes evidence + richer order/customer relations. */
export interface DisputeDetail extends Dispute {
  evidence: DisputeEvidence[];
  raisedBy?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
}

interface DisputesListResponse {
  data: Dispute[];
  total?: number;
  nextCursor: string | null;
}

export interface DisputeListFilters {
  status?: DisputeStatus;
  severity?: DisputeSeverity;
  cursor?: string;
}

export function useDisputes(filters: DisputeListFilters) {
  const { token, loading: authLoading } = useAccessToken();

  return useQuery({
    queryKey: ['vendor', 'disputes', 'list', filters],
    enabled: !!token && !authLoading,
    queryFn: () =>
      apiRequest<DisputesListResponse>('/disputes', {
        accessToken: token!,
        query: {
          status: filters.status,
          severity: filters.severity,
          cursor: filters.cursor,
          limit: 50,
        },
      }),
  });
}

export function useDispute(id: string | undefined) {
  const { token, loading: authLoading } = useAccessToken();

  return useQuery({
    queryKey: ['vendor', 'disputes', 'detail', id],
    enabled: !!id && !!token && !authLoading,
    queryFn: () =>
      apiRequest<DisputeDetail>(`/disputes/${id}`, {
        accessToken: token!,
      }),
  });
}

export function useDisputeEvidence(id: string | undefined) {
  const { token, loading: authLoading } = useAccessToken();

  return useQuery({
    queryKey: ['vendor', 'disputes', 'evidence', id],
    enabled: !!id && !!token && !authLoading,
    queryFn: () =>
      apiRequest<DisputeEvidence[]>(`/disputes/${id}/evidence`, {
        accessToken: token!,
      }),
  });
}

/**
 * Submit the vendor's response to a dispute. The API advances
 * open → vendor_contacted and REJECTS with DISPUTE_ESCALATED /
 * DISPUTE_CLOSED when responses are locked — those surface as
 * `ApiError` (with `.code`) so the caller can render a friendly notice.
 */
export function useSubmitVendorResponse(id: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (response: string) =>
      apiRequest<Dispute>(`/disputes/${id}/vendor-response`, {
        method: 'POST',
        accessToken: token!,
        body: { response },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendor', 'disputes', 'detail', id] });
      void qc.invalidateQueries({ queryKey: ['vendor', 'disputes', 'list'] });
    },
  });
}

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export function useUploadEvidence(id: string) {
  const { token } = useAccessToken();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { file: File; type: EvidenceType; caption?: string }) => {
      if (input.file.size > MAX_EVIDENCE_BYTES) {
        throw new Error('File exceeds 10 MB');
      }
      if (
        (input.type === 'photo' || input.type === 'screenshot') &&
        !input.file.type.startsWith('image/')
      ) {
        throw new Error(`${input.type} evidence must be an image file`);
      }
      const fd = new FormData();
      fd.append('file', input.file);
      fd.append('type', input.type);
      if (input.caption) fd.append('caption', input.caption);

      const res = await fetch(`${API_URL}/v1/disputes/${id}/evidence`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `Upload failed (${res.status})`);
      }
      return (await res.json()) as DisputeEvidence;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vendor', 'disputes', 'evidence', id] });
      void qc.invalidateQueries({ queryKey: ['vendor', 'disputes', 'detail', id] });
    },
  });
}
