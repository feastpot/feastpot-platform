'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import { useApi } from './use-api';

export interface SearchAnalyticsRow {
  query: string;
  searchCount: number;
  avgResults: number;
  zeroResultCount: number;
  lastSearched: string;
}

interface SearchAnalyticsPage {
  data: SearchAnalyticsRow[];
  hasMore: boolean;
  nextCursor: string | null;
  limit: number;
}

const PAGE_SIZE = 25;

/**
 * Cursor-paginated search analytics. Pages are accumulated and flattened into
 * `rows` so the trends card keeps treating the data as a single list, while
 * `fetchNextPage` / `hasNextPage` drive the "Load more" control.
 */
export function useSearchAnalytics() {
  const { request, ready } = useApi();
  const query = useInfiniteQuery({
    queryKey: ['admin', 'search-analytics'],
    enabled: ready,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      request<SearchAnalyticsPage>(
        `/admin/search-analytics?limit=${PAGE_SIZE}${
          pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''
        }`,
      ),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];

  return {
    rows,
    isLoading: query.isLoading,
    error: query.error,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
