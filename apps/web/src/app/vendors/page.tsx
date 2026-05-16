'use client';

import { Search, WifiOff, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { CuisineFilterSkeleton } from '@/components/home/cuisine-filters-skeleton';
import { CuisineFilter } from '@/components/vendor/cuisine-filter';
import { PageShell } from '@/components/layout/page-shell';
import { VendorCard } from '@/components/vendor/vendor-card';
import { VendorCardSkeleton } from '@/components/vendor/vendor-card-skeleton';
import { VendorFilterSheet } from '@/components/vendor/vendor-filter-sheet';
import { PostcodeChip } from '@/components/vendors/postcode-chip';
import { VendorSearchInput } from '@/components/vendors/vendor-search-input';
import { useVendors } from '@/hooks/use-vendors';
import type { SearchVendorsParams, VendorSortBy } from '@/lib/api/vendors';
import { readStoredPostcode, writeStoredPostcode } from '@/lib/postcode';

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

  // Postcode persistence — two-way sync between the URL (which is the
  // source of truth for filters so links stay shareable) and
  // localStorage (so a returning user who lands on /vendors directly,
  // e.g. via the bottom-nav "Browse" tab, sees vendors for their
  // remembered location instead of an unfiltered national list).
  //
  // - URL has ?postcode= → write through to storage so the latest
  //   browsed postcode wins (the user implicitly picked it).
  // - URL has none but storage does → replaceState the URL so the
  //   PostcodeChip + the actual data fetch both see it. `replace`
  //   (not `push`) so the back button doesn't bounce the user
  //   between /vendors and /vendors?postcode=X.
  // - Neither → leave the page as-is (national results / empty
  //   state).
  //
  // `postcodeSyncResolved` gates the vendor query so we don't fire an
  // initial postcode-less national fetch + then a second filtered
  // fetch a tick later when the storage rehydrate replaces the URL.
  // The flag is true once we've either confirmed the URL has a
  // postcode, the URL is missing one but no saved postcode exists, OR
  // we've issued the replace (the next render with the new URL will
  // satisfy the first branch).
  const [postcodeSyncResolved, setPostcodeSyncResolved] = useState<boolean>(() =>
    typeof postcode === 'string' && postcode.length > 0,
  );
  useEffect(() => {
    if (postcode) {
      writeStoredPostcode(postcode);
      setPostcodeSyncResolved(true);
      return;
    }
    const saved = readStoredPostcode();
    if (!saved) {
      setPostcodeSyncResolved(true);
      return;
    }
    const next = new URLSearchParams(params?.toString() ?? '');
    next.set('postcode', saved);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    // Don't flip resolved here — wait for the replace to land and the
    // first branch above to fire on the next render. That avoids the
    // single national-list fetch the architect flagged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcode]);

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

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error, refetch } =
    useVendors(search, { enabled: postcodeSyncResolved });
  const vendors = data?.pages.flatMap((p) => p.data) ?? [];

  // Scroll-position restoration. Next 15's App Router doesn't restore
  // scroll on client-side back navigation, so tapping a vendor card and
  // pressing back drops the user at the top of the list — disorienting
  // when they were 20 cards deep.
  //
  // Persistence strategy: capture-phase click listener on the vendor
  // grid intercepts every navigation intent and writes scrollY BEFORE
  // Next's router unmounts the page. `pagehide` is kept as a belt-and-
  // braces fallback for hardware back / tab switch, but it isn't
  // reliable for SPA route changes on its own.
  //
  // Key is scoped to pathname + search params so /vendors?cuisine=jollof
  // and /vendors?cuisine=ghanaian don't restore each other's offsets
  // when the user changes filters.
  //
  // Restore strategy: a bounded rAF retry loop. With infinite scroll,
  // if the saved Y is past the initial content height the browser
  // silently clamps to the bottom; the loop polls scrollHeight for up
  // to ~30 frames (~500ms at 60fps) and re-triggers `fetchNextPage`
  // when more pages are needed to reach the saved offset.
  const searchKey = params?.toString() ?? '';
  const scrollKey = `feastpot.vendors-scroll:${pathname}?${searchKey}`;

  useEffect(() => {
    const save = () => {
      sessionStorage.setItem(scrollKey, String(window.scrollY));
    };
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('a[href^="/vendors/"]')) save();
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('pagehide', save);
    };
  }, [scrollKey]);

  useEffect(() => {
    if (vendors.length === 0) return;
    const saved = sessionStorage.getItem(scrollKey);
    if (!saved) return;
    const targetY = Number.parseInt(saved, 10);
    if (!Number.isFinite(targetY) || targetY <= 0) {
      sessionStorage.removeItem(scrollKey);
      return;
    }

    let frames = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max >= targetY) {
        window.scrollTo({ top: targetY, behavior: 'instant' as ScrollBehavior });
        sessionStorage.removeItem(scrollKey);
        return;
      }
      // Need more content. Trigger the next page (idempotent — TanStack
      // Query dedupes) and keep polling until we either have enough
      // height or run out of frames.
      if (hasNextPage && !isFetchingNextPage) fetchNextPage();
      if (++frames < 30) {
        requestAnimationFrame(tick);
      } else {
        // Give up — clamp to whatever height we have so we land near
        // the user's previous position rather than the top.
        window.scrollTo({ top: max, behavior: 'instant' as ScrollBehavior });
        sessionStorage.removeItem(scrollKey);
      }
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors.length > 0, scrollKey]);

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
            <h1 className="truncate font-display text-2xl font-black tracking-tight text-charcoal">
              {postcode ? `Kitchens near ${postcode}` : 'Browse kitchens'}
            </h1>
            {cuisineParam && (
              <p className="mt-0.5 text-xs font-medium text-charcoal-mid">
                Cuisine: <span className="font-bold text-brand">{cuisineParam}</span>
              </p>
            )}
          </div>
          <VendorFilterSheet />
        </header>

        {q && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-charcoal-mid">Results for</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-bold text-white">
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
              <span className="text-xs font-medium text-charcoal-mid">
                {vendors.length} {vendors.length === 1 ? 'kitchen' : 'kitchens'}
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

        {/* Loading state — skeleton cards in the same grid as the real
            results. We deliberately do NOT render CuisineFilterSkeleton
            here because the live <CuisineFilter /> above is already
            mounted and interactive (the user can change cuisine while
            data is loading); duplicating it would create a visible
            collapse when the skeleton unmounted. The empty/error
            branches below remain string-based because they're terminal
            states, not transient loads.

            role="status" + sr-only text gives screen readers a single
            announcement; the visual subtree is aria-hidden so SR users
            don't traverse 6× empty list/listitem nodes. */}
        {isLoading && (
          <div role="status" aria-live="polite">
            <span className="sr-only">Loading vendors</span>
            <ul
              aria-hidden="true"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i}>
                  <VendorCardSkeleton />
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="flex flex-col items-center rounded-3xl border border-cream-deep bg-white px-6 py-12 text-center shadow-card"
          >
            <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-scotch/10 text-scotch" aria-hidden>
              <WifiOff className="h-7 w-7" strokeWidth={2.25} />
            </span>
            <h3 className="mb-2 font-display text-xl font-black text-charcoal">
              Couldn&rsquo;t reach our kitchens
            </h3>
            <p className="mx-auto mb-5 max-w-[280px] text-[13px] font-medium leading-relaxed text-charcoal-mid">
              This usually fixes itself in a few seconds.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="touch-target rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state — different copy when the user typed a query, since
            "no results for jollof" is a different problem from "no kitchens live yet". */}
        {empty && q && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-cream-deep bg-white px-6 py-16 text-center shadow-card">
            <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-light text-brand" aria-hidden>
              <Search className="h-7 w-7" strokeWidth={2.25} />
            </span>
            <h2 className="mb-2 font-display text-xl font-black text-charcoal">
              No results for &ldquo;{q}&rdquo;
            </h2>
            <p className="mb-5 max-w-[300px] text-sm font-medium text-charcoal-mid">
              {postcode
                ? `Try a different dish name or browse all kitchens near ${postcode}.`
                : 'Try a different search term or browse all kitchens.'}
            </p>
            <button
              type="button"
              onClick={clearSearch}
              className="touch-target rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
            >
              Browse all kitchens
            </button>
          </div>
        )}

        {empty && !q && (
          <div className="rounded-3xl border border-cream-deep bg-white p-8 text-center shadow-card">
            <h2 className="font-display text-lg font-black text-charcoal">
              No kitchens{postcode ? ` near ${postcode}` : ''} yet
            </h2>
            <p className="mt-2 text-sm font-medium text-charcoal-mid">
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
            className="touch-target w-full rounded-xl border border-cream-deep bg-white py-3 text-sm font-bold text-charcoal transition-colors hover:bg-brand-light hover:text-brand-dark disabled:opacity-50"
          >
            {isFetchingNextPage ? 'Loading…' : 'Load more kitchens'}
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
          {/* Suspense fires before useSearchParams resolves; show the
              skeleton shell (cuisine rail + grid) so first paint never
              flashes a bare "Loading…" string. The live CuisineFilter
              hasn't mounted yet at this point so showing the skeleton
              rail here is correct (no duplication, unlike the in-page
              isLoading branch). */}
          <div className="space-y-4 py-4" role="status" aria-live="polite">
            <span className="sr-only">Loading vendors</span>
            <div aria-hidden="true">
              <CuisineFilterSkeleton />
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <li key={i}>
                    <VendorCardSkeleton />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </PageShell>
      }
    >
      <VendorSearch />
    </Suspense>
  );
}
