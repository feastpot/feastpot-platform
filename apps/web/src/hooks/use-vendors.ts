'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import {
  getVendorBySlug,
  getVendorReviews,
  searchVendors,
  type SearchVendorsParams,
  type VendorListResponse,
} from '@/lib/api/vendors';

const VENDORS_KEY = 'vendors';

/**
 * Infinite paginated vendor search backed by GET /v1/vendors.
 *
 * The query key embeds the full filter object so changing a filter creates a
 * brand-new infinite cache entry (no stale rows from the previous filter
 * leaking into the new list). `getNextPageParam` returns `undefined` when the
 * server replies with `nextCursor: null`, which stops `fetchNextPage()`.
 */
export function useVendors(params: SearchVendorsParams, options?: { enabled?: boolean }) {
  return useInfiniteQuery<VendorListResponse, Error>({
    queryKey: [VENDORS_KEY, 'list', params],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      searchVendors({ ...params, cursor: pageParam as string | undefined }, { signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
  });
}

/** Single-vendor profile for the [slug] page. */
export function useVendor(slug: string) {
  return useQuery({
    queryKey: [VENDORS_KEY, 'profile', slug],
    queryFn: ({ signal }) => getVendorBySlug(slug, { signal }),
    enabled: Boolean(slug),
  });
}

export function useVendorReviews(vendorId: string | undefined) {
  return useInfiniteQuery({
    queryKey: [VENDORS_KEY, 'reviews', vendorId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getVendorReviews(vendorId!, { cursor: pageParam as string | undefined }, { signal }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(vendorId),
  });
}
