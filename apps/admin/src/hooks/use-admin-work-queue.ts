'use client';

import { useQuery } from '@tanstack/react-query';

import { useApi } from './use-api';

export interface WorkQueueItem {
  id: string;
  type: string;
  title: string;
  href: string;
  detail?: string;
  deadline?: string | null;
  ageDays?: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  consequence?: 'money' | 'food-safety' | 'operations' | 'compliance';
}

export interface AdminWorkQueue {
  observedAt: string;
  items: WorkQueueItem[];
  counts: Record<string, number>;
}

export function useAdminWorkQueue() {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'work-queue'],
    enabled: ready,
    queryFn: () => request<AdminWorkQueue>('/admin/work-queue'),
  });
}