'use client';

import { useQuery } from '@tanstack/react-query';

import { useApi } from './use-api';

export interface CoverageWaitlistPostcode {
  postcode: string;
  count: number;
}

export interface CoverageWaitlist {
  total: number;
  topPostcodes: CoverageWaitlistPostcode[];
}

export function useCoverageWaitlist() {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'coverage-waitlist'],
    enabled: ready,
    refetchInterval: 30_000,
    queryFn: () => request<CoverageWaitlist>('/admin/coverage-interest/count'),
  });
}

export interface CoverageInterestRow {
  id: string;
  email: string;
  postcode: string;
  name: string | null;
  marketingConsent: boolean | null;
  source: string | null;
  notified: boolean;
  createdAt: string;
}

export interface CoverageInterestPage {
  data: CoverageInterestRow[];
  total: number;
  nextCursor: string | null;
}

export interface CoverageInterestFilters {
  postcode?: string;
  notified?: 'true' | 'false';
  cursor?: string;
  limit?: number;
}

export function buildCoverageInterestParams(filters: CoverageInterestFilters): string {
  const params = new URLSearchParams();
  if (filters.postcode?.trim()) params.set('postcode', filters.postcode.trim());
  if (filters.notified) params.set('notified', filters.notified);
  if (filters.cursor) params.set('cursor', filters.cursor);
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function useCoverageInterestList(filters: CoverageInterestFilters) {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'coverage-interest', filters],
    enabled: ready,
    queryFn: () =>
      request<CoverageInterestPage>(
        `/admin/coverage-interest${buildCoverageInterestParams(filters)}`,
      ),
  });
}
