'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { CuisineFilter } from '@/components/vendor/cuisine-filter';
import { PageShell } from '@/components/layout/page-shell';
import { VendorCard } from '@/components/vendor/vendor-card';
import { VendorFilterSheet } from '@/components/vendor/vendor-filter-sheet';
import { useVendors } from '@/hooks/use-vendors';
import type { SearchVendorsParams, VendorSortBy } from '@/lib/api/vendors';

/**
 * Vendor search page. URL is the source of truth for every filter so:
 *   /vendors?postcode=SE15&cuisine=Nigerian&halal=true&sort=rating
 * is a shareable, refresh-safe permalink and the back button restores state.
 */
function VendorSearch() {
  const params = useSearchParams();
  const postcode = params?.get('postcode') ?? undefined;
  const cuisineParam = params?.get('cuisine');
  const halal = params?.get('halal') === 'true';
  const orderType = params?.get('orderType') ?? undefined;
  const sortBy = (params?.get('sort') as VendorSortBy | null) ?? undefined;

  const search: SearchVendorsParams = {
    postcode,
    cuisine: cuisineParam ? [cuisineParam] : undefined,
    halal: halal || undefined,
    orderType: orderType as SearchVendorsParams['orderType'],
    sortBy,
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } = useVendors(search);
  const vendors = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <PageShell>
      <div className="space-y-4 py-4">
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

        <CuisineFilter active={cuisineParam} href={false} onSelect={(c) => {
          const next = new URLSearchParams(params?.toString() ?? '');
          if (c) next.set('cuisine', c);
          else next.delete('cuisine');
          window.history.replaceState({}, '', `/vendors?${next.toString()}`);
        }} />

        {isLoading && <p className="text-sm text-muted-foreground">Loading vendors&hellip;</p>}
        {error && (
          <p className="text-sm text-destructive">
            Couldn&rsquo;t load vendors. Please try again in a moment.
          </p>
        )}

        {!isLoading && !error && vendors.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <h2 className="font-semibold">No vendors{postcode ? ` near ${postcode}` : ''} yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Try a different cuisine or check back soon — new cooks join Feastpot every week.
            </p>
          </div>
        )}

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
  // useSearchParams() requires a Suspense boundary in app router.
  return (
    <Suspense fallback={<PageShell><p className="py-8 text-sm text-muted-foreground">Loading&hellip;</p></PageShell>}>
      <VendorSearch />
    </Suspense>
  );
}
