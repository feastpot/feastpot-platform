'use client';

import { useQuery } from '@tanstack/react-query';

import { useApi } from './use-api';

export interface SearchAnalyticsRow {
  query: string;
  searchCount: number;
  avgResults: number;
  zeroResultCount: number;
  lastSearched: string;
}

export function useSearchAnalytics() {
  const { request, ready } = useApi();
  return useQuery({
    queryKey: ['admin', 'search-analytics'],
    enabled: ready,
    queryFn: () => request<SearchAnalyticsRow[]>('/admin/search-analytics'),
  });
}
