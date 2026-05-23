'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './use-api';

export type DisputeStatus = 'open' | 'vendor_contacted' | 'resolved' | 'escalated' | 'closed';
export type Severity = 'low' | 'medium' | 'high';
export type ResolutionType = 'full_refund' | 'partial_refund' | 'credit' | 'rejected' | 'escalated';
export type SlaFilter = 'all' | 'overdue' | 'breaching_soon' | 'on_track' | 'resolved';

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
  total: number;
  nextCursor: string | null;
}

export interface DisputeFilters {
  status?: DisputeStatus;
  severities?: Severity[];
  sla?: SlaFilter;
  q?: string;
  createdFrom?: string;
  createdTo?: string;
  cursor?: string;
  limit?: number;
}

function buildParams(filters: DisputeFilters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.severities?.length) params.set('severities', filters.severities.join(','));
  if (filters.sla && filters.sla !== 'all') params.set('sla', filters.sla);
  if (filters.q?.trim()) params.set('q', filters.q.trim());
  if (filters.createdFrom) params.set('createdFrom', filters.createdFrom);
  if (filters.createdTo) params.set('createdTo', filters.createdTo);
  if (filters.cursor) params.set('cursor', filters.cursor);
  params.set('limit', String(filters.limit ?? 20));
  return params.toString();
}

export function useDisputes(filters: DisputeFilters) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'disputes', filters],
    enabled: ready,
    queryFn: () => request<DisputesPage>(`/disputes?${buildParams(filters)}`),
  });
}

export interface DisputeStats {
  total: number;
  overdue: number;
  breachingSoon: number;
  inProgress: number;
  totalDisputedValuePence: number;
  /** % change in created-disputes count, last 30 days vs prior 30. */
  deltaPct: number;
}

export function useDisputeStats(filters: Omit<DisputeFilters, 'cursor' | 'limit'>) {
  const { request, ready } = useApi();
  // Stats reuse the same filters as the list (minus pagination), so the
  // footer tiles always reflect the same scope as the table above them.
  const params = buildParams({ ...filters, limit: 1 });
  return useQuery({
    queryKey: ['admin', 'disputes', 'stats', filters],
    enabled: ready,
    queryFn: () => request<DisputeStats>(`/disputes/stats?${params}`),
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
