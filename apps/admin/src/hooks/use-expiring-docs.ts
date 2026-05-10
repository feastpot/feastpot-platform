'use client';

import { useQuery } from '@tanstack/react-query';

import type { DocumentStatus, DocumentType } from './use-admin-vendors';
import { useApi } from './use-api';

export interface ExpiringDocRow {
  id: string;
  vendorId: string;
  vendorName: string;
  type: DocumentType;
  status: DocumentStatus;
  fileUrl: string;
  fileName: string;
  expiresAt: string | null;
  daysRemaining: number | null;
  urgency: 'expired' | 'critical' | 'warning' | 'unknown';
}

export function useExpiringDocs() {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'compliance', 'expiring'],
    enabled: ready,
    queryFn: () => request<ExpiringDocRow[]>('/admin/compliance/expiring'),
  });
}
