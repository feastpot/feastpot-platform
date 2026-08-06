'use client';

import { useQuery } from '@tanstack/react-query';
import { MapPin, Search, WifiOff } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import { RecommendForm, WaitlistForm } from '@/components/home/waitlist-block';
import { PageShell } from '@/components/layout/page-shell';
import { VendorCardSkeleton } from '@/components/vendor/vendor-card-skeleton';
import { CategoryChips } from '@/components/vendors/category-chips';
import { VendorFiltersSidebar } from '@/components/vendors/vendor-filters-sidebar';
import { VendorResultsHeader } from '@/components/vendors/vendor-results-header';
import { VendorResultsHero } from '@/components/vendors/vendor-results-hero';
import { VendorRowCard } from '@/components/vendors/vendor-row-card';
import { VendorSearchBar } from '@/components/vendors/vendor-search-bar';
import { useVendors } from '@/hooks/use-vendors';
import {
  getVendorCardExtras,
  type SearchVendorsParams,
  type VendorSortBy,
} from '@/lib/api/vendors';
import { readStoredPostcode, writeCoverageCookie, writeStoredPostcode } from '@/lib/postcode';

/**
 * Vendor search page.
 *
 * URL is the source of truth for every filter so:
 *   /vendors?q=jollof&postcode=SE15&cuisine=Nigerian&halal=true&sort=rating
 * is a shareable, refresh-safe permalink and the back button restores state.
 *
 * A sticky mobile bar (above the fixed BottomNav) shows the active postcode
 * so the user always knows their search context and can change it in one tap.
 */
function VendorSearch() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const qParam = params?.get('q')?.trim() || undefined;
  const category = params?.get('category')?.trim() || undefined;
  const q = qParam ?? category;
  const postcode = params?.get('postcode') ?? undefined;
  const cuisineParam = params?.get('cuisine');

  // Postcode persistence - two-way sync between URL and localStorage.
  const [postcodeSyncResolved, setPostcodeSyncResolved] = useState<boolean>(
    () => typeof postcode === 'string' && postcode.length > 0,
  );
  useEffect(() => {
    if (postcode) {
      writeStoredPostcode(postcode);
      writeCoverageCookie(postcode);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcode]);

  const halal = params?.get('halal') === 'true';
  const sortParam = (params?.get('sort') as VendorSortBy | null) ?? undefined;
  const sortBy: VendorSortBy | undefined = sortParam ?? (postcode ? 'distance' : undefined);

  const RADIUS_OPTIONS_MI = [1, 3, 5, 10] as const;
  const radiusRaw = postcode ? params?.get('radius') : null;
  const radiusMiles = (() => {
    if (!radiusRaw) return null;
    const n = Number.parseFloat(radiusRaw);
    if (!Number.isFinite(n)) return null;
    return (RADIUS_OPTIONS_MI as readonly number[]).includes(n) ? n : null;
  })();
  const maxDistanceKm = radiusMiles !== null ? radiusMiles * 1.609344 : undefined;

  const search: SearchVendorsParams = {
    q,
    postcode,
    cuisine: cuisineParam ? [cuisineParam] : undefined,
    halal: halal || undefined,
    maxDistanceKm,
    sortBy,
  };

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error, refetch } =
    useVendors(search, { enabled: postcodeSyncResolved });
  const vendors = data?.pages.flatMap((p) => p.data) ?? [];

  const vendorIds = vendors.slice(0, 50).map((v) => v.id);
  const { data: cardExtras } = useQuery({
    queryKey: ['vendors', 'card-extras', vendorIds],
    queryFn: ({ signal }) => getVendorCardExtras(vendorIds, { signal }),
    enabled: vendorIds.length > 0,
    staleTime: 60_000,
  });

  // Scroll-position restoration on back-navigation.
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

  const hasNextPageRef = useRef(hasNextPage);
  const isFetchingNextPageRef = useRef(isFetchingNextPage);
  const fetchNextPageRef = useRef(fetchNextPage);
  hasNextPageRef.current = hasNextPage;
  isFetchingNextPageRef.current = isFetchingNextPage;
  fetchNextPageRef.current = fetchNextPage;

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
      if (hasNextPageRef.current && !isFetchingNextPageRef.current) {
        fetchNextPageRef.current();
      }
      if (++frames < 30) {
        requestAnimationFrame(tick);
      } else {
        window.scrollTo({ top: max, behavior: 'instant' as ScrollBehavior });
        sessionStorage.removeItem(scrollKey);
      }
    };
    requestAnimationFrame(tick);
    return () => {
      cancelled = true;
    };
  }, [vendors.length, scrollKey]);

  const empty = !isLoading && !error && vendors.length === 0;

  const handleChangePostcode = () => {
    writeStoredPostcode(null);
    writeCoverageCookie(null);
    router.push('/');
  };

  return (
    <PageShell>
      <div className="space-y-5 py-5">
        <VendorResultsHero postcode={postcode ?? null} />
        <VendorSearchBar />
        <CategoryChips />

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="hidden lg:block">
            <VendorFiltersSidebar />
          </div>

          <div className="space-y-4">
            <VendorResultsHeader
              count={vendors.length}
              postcode={postcode ?? null}
              loading={isLoading}
            />

            {/* Mobile: collapsed filter button */}
            <details className="rounded-2xl border border-cream-deep bg-white shadow-sm lg:hidden">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-bold text-charcoal">
                Filters
              </summary>
              <div className="border-t border-cream-deep p-2">
                <VendorFiltersSidebar />
              </div>
            </details>

            {isLoading && (
              <div role="status" aria-live="polite">
                <span className="sr-only">Loading vendors</span>
                <ul aria-hidden="true" className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
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
                <span
                  className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-scotch/10 text-scotch"
                  aria-hidden
                >
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

            {/* No results for a specific search query */}
            {empty && q && (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-cream-deep bg-white px-6 py-16 text-center shadow-card">
                <span
                  className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-light text-brand"
                  aria-hidden
                >
                  <Search className="h-7 w-7" strokeWidth={2.25} />
                </span>
                <h2 className="mb-2 font-display text-xl font-black text-charcoal">
                  No results for &ldquo;{q}&rdquo;
                </h2>
                <p className="mb-5 max-w-[300px] text-sm font-medium text-charcoal-mid">
                  {postcode
                    ? `Try a different dish name or browse all kitchens near ${postcode.toUpperCase()}.`
                    : 'Try a different search term or browse all kitchens.'}
                </p>
                <button
                  type="button"
                  onClick={() => router.replace('/vendors')}
                  className="touch-target rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
                >
                  Browse all kitchens
                </button>
              </div>
            )}

            {/* No vendors serve this postcode - rich empty state with waitlist/recommend forms */}
            {empty && !q && (
              <div className="rounded-3xl border border-cream-deep bg-white p-6 shadow-card sm:p-8">
                <h2 className="font-display text-xl font-black text-charcoal sm:text-2xl">
                  Feastpot is not serving your postcode yet.
                </h2>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-charcoal-mid">
                  We open postcode by postcode so you only see cooks who can actually deliver to
                  you. Join the waitlist and tell us who you want to see on Feastpot.
                </p>

                <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {/* Waitlist */}
                  <div className="rounded-2xl border border-cream-deep bg-cream/40 p-5">
                    <p className="mb-1 font-display text-[15px] font-black text-charcoal">
                      Notify me when cooks arrive
                    </p>
                    <p className="mb-4 text-[13px] font-medium text-charcoal-mid">
                      We will message you when a cook starts delivering to your postcode.
                    </p>
                    <WaitlistForm
                      initialPostcode={postcode ?? ''}
                      source="search-empty"
                      submitLabel="Join the waitlist"
                    />
                  </div>

                  {/* Recommend a cook */}
                  <div className="rounded-2xl border border-cream-deep bg-cream/40 p-5">
                    <p className="mb-1 font-display text-[15px] font-black text-charcoal">
                      Know a cook we should invite?
                    </p>
                    <p className="mb-4 text-[13px] font-medium text-charcoal-mid">
                      Share their Instagram, business name or phone number.
                    </p>
                    <RecommendForm />
                  </div>
                </div>
              </div>
            )}

            {vendors.length > 0 && (
              <ul className="space-y-3">
                {vendors.map((v) => (
                  <li key={v.id}>
                    <VendorRowCard
                      vendor={v}
                      trustSignals={cardExtras?.trustSignals[v.id]}
                      capacity={cardExtras?.capacity[v.id]}
                    />
                  </li>
                ))}
              </ul>
            )}

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
        </div>
      </div>

      {/*
        Sticky mobile bar - shows the active postcode above the BottomNav (z-50,
        bottom-0, 64px tall). Sits at bottom-16 (64px) so it does not overlap
        the tab bar; hidden on lg+ where the hero already shows the postcode.
      */}
      {postcode && (
        <div
          aria-label="Current postcode"
          className="fixed inset-x-0 bottom-16 z-40 flex items-center justify-between gap-3 border-t border-cream-warm bg-white/95 px-4 py-2.5 shadow-sticky backdrop-blur-sm lg:hidden"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <span className="inline-flex items-center gap-1.5 text-sm font-bold text-charcoal">
            <MapPin className="h-4 w-4 shrink-0 text-brand" aria-hidden />
            {postcode.toUpperCase()}
          </span>
          <button
            type="button"
            onClick={handleChangePostcode}
            className="shrink-0 rounded-lg border border-cream-deep bg-white px-3 py-1.5 text-xs font-bold text-charcoal transition hover:bg-cream"
          >
            Change postcode
          </button>
        </div>
      )}
    </PageShell>
  );
}

export default function VendorsPage() {
  return (
    <Suspense
      fallback={
        <PageShell>
          <div className="space-y-5 py-5" role="status" aria-live="polite">
            <span className="sr-only">Loading vendors</span>
            <div aria-hidden="true" className="h-32 rounded-3xl bg-cream" />
            <div aria-hidden="true" className="h-14 rounded-2xl bg-cream" />
            <div aria-hidden="true" className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="hidden h-96 rounded-3xl bg-cream lg:block" />
              <ul className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
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
