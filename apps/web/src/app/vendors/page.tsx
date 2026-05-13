'use client';

import { X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { CuisineFilter } from '@/components/vendor/cuisine-filter';
import { PageShell } from '@/components/layout/page-shell';
import { VendorCard } from '@/components/vendor/vendor-card';
import { VendorFilterSheet } from '@/components/vendor/vendor-filter-sheet';
import { PostcodeChip } from '@/components/vendors/postcode-chip';
import { VendorSearchInput } from '@/components/vendors/vendor-search-input';
import { useVendors } from '@/hooks/use-vendors';
import type { SearchVendorsParams, VendorSortBy } from '@/lib/api/vendors';

/**
 * Vendor search page. URL is the source of truth for every filter so:
 *   /vendors?q=jollof&postcode=SE15&cuisine=Nigerian&halal=true&sort=rating
 * is a shareable, refresh-safe permalink and the back button restores state.
 */
function VendorSearch() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const q = params?.get('q')?.trim() || undefined;
  const postcode = params?.get('postcode') ?? undefined;
  const cuisineParam = params?.get('cuisine');
  const halal = params?.get('halal') === 'true';
  const orderType = params?.get('orderType') ?? undefined;
  const sortBy = (params?.get('sort') as VendorSortBy | null) ?? undefined;

  const search: SearchVendorsParams = {
    q,
    postcode,
    cuisine: cuisineParam ? [cuisineParam] : undefined,
    halal: halal || undefined,
    orderType: orderType as SearchVendorsParams['orderType'],
    sortBy,
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    useVendors(search);
  const vendors = data?.pages.flatMap((p) => p.data) ?? [];

  const clearSearch = () => {
    const next = new URLSearchParams(params?.toString() ?? '');
    next.delete('q');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const empty = !isLoading && !error && vendors.length === 0;

  return (
    <PageShell>
      <div className="space-y-4 py-4">
        <PostcodeChip />

        <VendorSearchInput />

        <header className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight">
              {postcode ? `Vendors near ${postcode}` : 'Vendors'}
            </h1>
            {cuisineParam && (
              <p className="text-xs text-muted-foreground">Cuisine: {cuisineParam}</p>
            )}
          </div>
          <VendorFilterSheet />
        </header>

        {q && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Results for</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 text-xs font-medium text-white">
              {q}
              <button
                type="button"
                onClick={clearSearch}
                aria-label={`Clear search for ${q}`}
                className="-mr-1 rounded-full p-0.5 hover:bg-white/20"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
            {!isLoading && (
              <span className="text-xs text-muted-foreground">
                {vendors.length} {vendors.length === 1 ? 'vendor' : 'vendors'}
              </span>
            )}
          </div>
        )}

        <CuisineFilter
          active={cuisineParam}
          href={false}
          onSelect={(c) => {
            const next = new URLSearchParams(params?.toString() ?? '');
            if (c) next.set('cuisine', c);
            else next.delete('cuisine');
            window.history.replaceState({}, '', `/vendors?${next.toString()}`);
          }}
        />

        {isLoading && <p className="text-sm text-muted-foreground">Loading vendors&hellip;</p>}
        {error && (
          <p className="text-sm text-destructive">
            Couldn&rsquo;t load vendors. Please try again in a moment.
          </p>
        )}

        {/* Empty state — different copy when the user typed a query, since
            "no results for jollof" is a different problem from "no vendors live yet". */}
        {empty && q && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <span className="mb-4 text-5xl" aria-hidden>
              🔍
            </span>
            <h2 className="mb-2 text-lg font-bold">No results for &ldquo;{q}&rdquo;</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {postcode
                ? `Try a different dish name or browse all vendors near ${postcode}.`
                : 'Try a different search term or browse all vendors.'}
            </p>
            <button
              type="button"
              onClick={clearSearch}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              Browse all vendors
            </button>
          </div>
        )}

        {empty && !q && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <h2 className="font-semibold">No vendors{postcode ? ` near ${postcode}` : ''} yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different cuisine or check back soon — new cooks join Feastpot every week.
            </p>
          </div>
        )}

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.map((v) => (
            <li key={v.id}>
              <VendorCard vendor={v} />
            </li>
          ))}
        </ul>

        {hasNextPage && (
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="w-full rounded-md border border-border bg-background py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </PageShell>
  );
}

export default function VendorsPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <p className="py-8 text-sm text-muted-foreground">Loading&hellip;</p>
        </PageShell>
      }
    >
      <VendorSearch />
    </Suspense>
  );
}
