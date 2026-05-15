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
    queryFn: async ({ pageParam, signal }) => {
      try {
        const res = await searchVendors(
          { ...params, cursor: pageParam as string | undefined },
          { signal },
        );
        // Mirror the first page into localStorage so the offline shell
        // (`/offline`) can show a "last seen vendors" list even when the SW
        // hasn't precached the route yet. Skipped on subsequent pages so we
        // don't keep overwriting the cache with deeper pagination tails.
        if (!pageParam && typeof window !== 'undefined') {
          try {
            const slim = (res.data ?? []).slice(0, 20).map((v) => ({
              id: v.id,
              slug: v.slug,
              businessName: v.businessName,
            }));
            localStorage.setItem('fp.vendors.cache', JSON.stringify(slim));
          } catch {
            /* quota exceeded / private mode — silently ignore */
          }
        }
        return res;
      } catch (err) {
        // Capture API failures with enough breadcrumbs to diagnose
        // misconfigured NEXT_PUBLIC_API_URL or CORS in prod (the most
        // common cause of an empty list with a network error).
        // TanStack Query v5 dropped the per-query `onError` callback,
        // so we log here in the queryFn before re-throwing.
        if (typeof window !== 'undefined') {
          // eslint-disable-next-line no-console
          console.error('[Vendors] API failed:', {
            message: (err as Error).message,
            apiUrl: process.env.NEXT_PUBLIC_API_URL,
            time: new Date().toISOString(),
          });
        }
        throw err;
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
    // Three retries with exponential back-off (capped at 10s) so transient
    // upstream blips (cold-start, API redeploy) don't surface as a hard
    // error to the user. The infinite-query fetch is idempotent so retries
    // are safe.
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
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
