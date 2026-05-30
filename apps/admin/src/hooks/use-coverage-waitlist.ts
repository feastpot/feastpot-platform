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
