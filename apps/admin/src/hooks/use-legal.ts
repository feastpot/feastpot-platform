'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useApi } from './use-api';

// ─── Shared types ─────────────────────────────────────────────────────────────

export type DocType = 'VENDOR_TERMS' | 'CUSTOMER_TERMS' | 'PRIVACY' | 'COOKIES' | 'RATE_SCHEDULE';
export type VersionStatus = 'live' | 'pending' | 'superseded';
export type AcceptanceMethod = 'CLICKWRAP' | 'DEEMED' | 'OFFLINE';
export type NoticeChannel = 'EMAIL' | 'WHATSAPP' | 'DASHBOARD';
export type AppealOutcome = 'UPHELD' | 'DISMISSED';

// ─── Terms versions ──────────────────────────────────────────────────────────

export interface TermsVersionSummary {
  id: string;
  version: string;
  documentType: DocType;
  changeSummary: string;
  isMaterial: boolean;
  publishedAt: string;
  effectiveAt: string;
  supersededAt: string | null;
  contentHash: string;
  solicitorSignOff: string | null;
  createdBy: string;
  status: VersionStatus;
  _count: { acceptances: number; notices: number };
}

export interface TermsVersionDetail extends TermsVersionSummary {
  contentMdx: string;
  liveVersion: {
    id: string;
    version: string;
    contentMdx: string;
    contentHash: string;
  } | null;
}

export function useAdminTermsVersions() {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'terms', 'versions'],
    enabled: ready,
    queryFn: () => request<TermsVersionSummary[]>('/terms/admin/versions'),
  });
}

export function useAdminTermsVersion(id: string) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'terms', 'versions', id],
    enabled: ready && Boolean(id),
    queryFn: () => request<TermsVersionDetail>(`/terms/admin/versions/${id}`),
  });
}

export interface PublishVersionInput {
  documentType: DocType;
  version: string;
  contentMdx: string;
  changeSummary: string;
  isMaterial: boolean;
  effectiveAt: string;
  createdBy: string;
  solicitorSignOff?: string;
}

export function usePublishTermsVersion() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PublishVersionInput) =>
      request<TermsVersionSummary>('/terms/versions', { method: 'POST', body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'terms', 'versions'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'legal', 'alerts'] });
    },
  });
}

// ─── Coverage ────────────────────────────────────────────────────────────────

export interface CoverageVendorRow {
  vendorId: string;
  businessName: string;
  vendorStatus: string;
  acceptedVersionId: string | null;
  acceptedVersion: string | null;
  acceptedAt: string | null;
  method: AcceptanceMethod | null;
  onCurrentVersion: boolean;
}

export interface CoverageData {
  liveVersion: { id: string; version: string; effectiveAt: string } | null;
  totalActive: number;
  onCurrentCount: number;
  coveragePct: number;
  vendors: CoverageVendorRow[];
}

export function useAdminCoverage(documentType: DocType = 'VENDOR_TERMS', onlyBehind = false) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'legal', 'coverage', documentType, onlyBehind],
    enabled: ready,
    queryFn: () =>
      request<CoverageData>(
        `/terms/admin/coverage?documentType=${documentType}&onlyBehind=${onlyBehind}`,
      ),
    staleTime: 30_000,
  });
}

// ─── Notices ─────────────────────────────────────────────────────────────────

export interface NoticeSummary {
  termsVersionId: string;
  version: string;
  documentType: string;
  sent: number;
  delivered: number;
  opened: number;
  acknowledged: number;
  bounced: number;
}

export interface NoticeRow {
  id: string;
  vendorId: string;
  termsVersionId: string;
  sentAt: string;
  channel: NoticeChannel;
  deliveredAt: string | null;
  openedAt: string | null;
  acknowledgedAt: string | null;
  termsVersion: { version: string; documentType: string; effectiveAt: string };
  vendor: { businessName: string; status: string };
}

export interface NoticesData {
  summary: NoticeSummary[];
  notices: NoticeRow[];
}

export function useAdminNotices(termsVersionId?: string) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'legal', 'notices', termsVersionId ?? 'all'],
    enabled: ready,
    queryFn: () =>
      request<NoticesData>(
        `/terms/admin/notices${termsVersionId ? `?termsVersionId=${termsVersionId}` : ''}`,
      ),
    staleTime: 15_000,
  });
}

export function useResendNotice() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (noticeId: string) =>
      request<{ queued: boolean; noticeId: string }>(`/terms/admin/notices/${noticeId}/resend`, {
        method: 'POST',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'legal', 'notices'] });
    },
  });
}

// ─── Alerts ──────────────────────────────────────────────────────────────────

export interface LegalAlerts {
  coverageGap: {
    count: number;
    coveragePct: number;
    liveVersion: { id: string; version: string; effectiveAt: string } | null;
  };
  bouncedNotices: {
    count: number;
    sample: { id: string; vendorId: string; termsVersionId: string; sentAt: string; channel: string }[];
  };
  lateEnforcementNotices: {
    count: number;
    sample: {
      id: string;
      vendorId: string;
      actionType: string;
      effectiveAt: string;
      noticeSentAt: string;
      vendor: { businessName: string };
    }[];
  };
  urgentAppeals: {
    count: number;
    sample: { id: string; disputeId: string; submittedAt: string }[];
  };
}

export function useAdminLegalAlerts() {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'legal', 'alerts'],
    enabled: ready,
    queryFn: () => request<LegalAlerts>('/terms/admin/alerts'),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

// ─── Enforcement log ─────────────────────────────────────────────────────────

export interface EnforcementLogRow {
  id: string;
  vendorId: string;
  actionType: string;
  reasonCode: string;
  reasonNarrative: string;
  effectiveAt: string;
  noticeSentAt: string | null;
  urgentBasis: string | null;
  issuedBy: string;
  appealId: string | null;
  liftedAt: string | null;
  liftedBy: string | null;
  liftNote: string | null;
  createdAt: string;
  noticeLate: boolean;
  vendor: { businessName: string; status: string; slug: string };
}

export function useAdminEnforcementLog(opts?: { actionType?: string; liftedAt?: 'active' | 'all' }) {
  const { request, ready } = useApi();
  const params = new URLSearchParams();
  if (opts?.actionType) params.set('actionType', opts.actionType);
  if (opts?.liftedAt) params.set('liftedAt', opts.liftedAt);
  const qs = params.toString();
  return useQuery({
    queryKey: ['admin', 'legal', 'enforcement', opts?.actionType ?? 'all', opts?.liftedAt ?? 'all'],
    enabled: ready,
    queryFn: () => request<EnforcementLogRow[]>(`/admin/enforcement${qs ? '?' + qs : ''}`),
    staleTime: 30_000,
  });
}

// ─── Appeals queue ───────────────────────────────────────────────────────────

export interface AppealQueueItem {
  id: string;
  disputeId: string;
  grounds: string;
  submittedAt: string;
  deadline: string;
  stage1By: string | null;
  stage1At: string | null;
  stage1Outcome: AppealOutcome | null;
  stage1Reasons: string | null;
  stage2By: string | null;
  stage2At: string | null;
  stage2Outcome: AppealOutcome | null;
  stage2Reasons: string | null;
  hoursToDeadline: number;
  urgent: boolean;
  overdue: boolean;
  stage1Pending: boolean;
  stage2Pending: boolean;
  vendorName: string;
  dispute: {
    id: string;
    status: string;
    decision: string | null;
    decidedAt: string | null;
    isUrgentDispute: boolean;
    order: { orderNumber: string; totalPence: number; vendor: { businessName: string } };
  };
}

export function useAdminAppealsQueue() {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'legal', 'appeals'],
    enabled: ready,
    queryFn: () => request<AppealQueueItem[]>('/disputes/admin/appeals'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

// ─── Evidence export ─────────────────────────────────────────────────────────

export function useEvidenceExport() {
  const { request } = useApi();
  return useMutation({
    mutationFn: ({
      vendorId,
      from,
      to,
    }: {
      vendorId: string;
      from?: string;
      to?: string;
    }) => {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const qs = params.toString();
      return request<Record<string, unknown>>(
        `/terms/admin/evidence/${vendorId}${qs ? '?' + qs : ''}`,
      );
    },
  });
}
