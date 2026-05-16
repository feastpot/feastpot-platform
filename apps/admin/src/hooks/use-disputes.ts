'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './use-api';

export type DisputeStatus = 'open' | 'vendor_contacted' | 'resolved' | 'escalated' | 'closed';
export type Severity = 'low' | 'medium' | 'high';
export type ResolutionType = 'full_refund' | 'partial_refund' | 'credit' | 'rejected' | 'escalated';

export interface DisputeRow {
  id: string;
  status: DisputeStatus;
  severity: Severity;
  issueType: string;
  description: string;
  resolutionNote: string | null;
  resolution: ResolutionType | null;
  refundAmountPence: number | null;
  createdAt: string;
  closedAt: string | null;
  vendorRespondedAt: string | null;
  resolvedAt: string | null;
  order: {
    id: string;
    orderNumber: string;
    totalPence: number;
    vendor: { id: string; businessName: string };
    customer: { id: string; firstName: string | null; lastName: string | null; email: string };
  };
}

export interface DisputesPage {
  data: DisputeRow[];
  nextCursor: string | null;
}

export function useDisputes(filters: { status?: DisputeStatus; severity?: Severity }) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'disputes', filters],
    enabled: ready,
    queryFn: () => {
      const params = new URLSearchParams();
      if (filters.status) params.set('status', filters.status);
      if (filters.severity) params.set('severity', filters.severity);
      params.set('limit', '50');
      return request<DisputesPage>(`/disputes?${params.toString()}`);
    },
  });
}

export interface Evidence {
  id: string;
  type: 'image' | 'video' | 'pdf' | 'document';
  fileUrl: string;
  caption: string | null;
  uploadedAt: string;
}

export interface DisputeDetail extends DisputeRow {
  evidence?: Evidence[];
}

export function useDispute(id: string) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'dispute', id],
    enabled: ready && Boolean(id),
    queryFn: () => request<DisputeDetail>(`/disputes/${id}`),
  });
}

export function useDisputeEvidence(id: string) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'dispute', id, 'evidence'],
    enabled: ready && Boolean(id),
    queryFn: () => request<Evidence[]>(`/disputes/${id}/evidence`),
  });
}

export function useUpdateDispute(id: string) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { status?: DisputeStatus; severity?: Severity; assignedToId?: string; resolutionNote?: string }) =>
      request(`/disputes/${id}`, { method: 'PATCH', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'dispute', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'disputes'] });
    },
  });
}

export function useCloseDispute(id: string) {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { resolution: ResolutionType; resolutionNote?: string; refundAmountPence?: number }) =>
      request(`/disputes/${id}/close`, { method: 'POST', body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'dispute', id] });
      qc.invalidateQueries({ queryKey: ['admin', 'disputes'] });
    },
  });
}
