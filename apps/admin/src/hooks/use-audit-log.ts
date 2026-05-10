'use client';

import { useQuery } from '@tanstack/react-query';

import { useApi } from './use-api';

export interface AuditFilters {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AuditLogRow {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; firstName: string | null; lastName: string | null; email: string; role: string } | null;
}

export interface AuditLogPage {
  data: AuditLogRow[];
  nextCursor: string | null;
}

export function useAuditLog(filters: AuditFilters) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'audit-log', filters],
    enabled: ready,
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, v);
      });
      params.set('limit', '100');
      return request<AuditLogPage>(`/admin/audit-log?${params.toString()}`);
    },
  });
}
