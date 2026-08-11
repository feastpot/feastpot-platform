'use client';

import { useQuery } from '@tanstack/react-query';
import { MapPin, Search, WifiOff } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useRef, useState } from 'react';

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
  ALLERGEN_FREE_SLUG_SET,
  DIETARY_PREFERENCE_SLUG_SET,
} from '@feastpot/config/allergens';

import {
  getVendorCardExtras,
  type SearchVendorsParams,
  type VendorSortBy,
} from '@/lib/api/vendors';
import { readStoredPostcode, writeCoverageCookie, writeStoredPostcode } from '@/lib/postcode';

/**
 * Same regex as waitlist-block.tsx. Accepts outward-only (SE15) and full
 * (SE15 4EE) UK postcodes, case-insensitive. Validated client-side to avoid
 * firing a useless API call on partial input.
 */
const UK_POSTCODE_RE = /^[A-Z]{1,2}[0-9][0-9A-Z]?(\s*[0-9][A-Z]{2})?$/i;

/**
 * Vendor search page.
 *
 * URL is the source of truth for every filter so:
 *   /vendors?q=jollof&postcode=SE15&cuisine=Nigerian&halal=true&sort=rating
 * is a shareable, refresh-safe permalink and the back button restores state.
 *
 * Four states in priority order:
 *   1. postcodeSyncResolved=false  → brief skeleton (checking localStorage)
 *   2. no postcode                 → designed entry prompt (never a spinner)
 *   3. invalid postcode format     → inline error + retry
 *   4. postcode valid              → loading | error | empty | results
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

  // ── Postcode entry form (no-postcode state) ──────────────────────────────
  const [postcodeEntry, setPostcodeEntry] = useState('');
  const [postcodeEntryError, setPostcodeEntryError] = useState('');

  const handlePostcodeSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = postcodeEntry.trim().toUpperCase();
    if (!trimmed) {
      setPostcodeEntryError('Enter your postcode.');
      return;
    }
    if (!UK_POSTCODE_RE.test(trimmed)) {
      setPostcodeEntryError('Enter a valid UK postcode, e.g. SE15 or SE15 4EE.');
      return;
    }
    const next = new URLSearchParams(params?.toString() ?? '');
    next.set('postcode', trimmed);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  // ── Postcode persistence - two-way sync between URL and localStorage ─────
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

  // ── Inline postcode format validation ───────────────────────────────────
  // Prevents a malformed URL param (copy-paste, external link) from firing
  // a useless API call and showing a confusing empty state.
  const postcodeIsValid = !postcode || UK_POSTCODE_RE.test(postcode.trim());

  const halal = params?.get('halal') === 'true';

  const allergenFreeRaw = params?.get('allergenFree');
  const allergenFree =
    allergenFreeRaw && allergenFreeRaw.length > 0
      ? allergenFreeRaw
          .split(',')
          .map((v) => v.toLowerCase().trim())
          .filter((v) => ALLERGEN_FREE_SLUG_SET.has(v))
      : undefined;

  const dietaryPrefsRaw = params?.get('dietaryPreferences');
  const dietaryPreferences =
    dietaryPrefsRaw && dietaryPrefsRaw.length > 0
      ? dietaryPrefsRaw
          .split(',')
          .map((v) => v.toLowerCase().trim())
          .filter((v) => DIETARY_PREFERENCE_SLUG_SET.has(v))
      : undefined;

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
    allergenFree: allergenFree && allergenFree.length > 0 ? allergenFree : undefined,
    dietaryPreferences:
      dietaryPreferences && dietaryPreferences.length > 0 ? dietaryPreferences : undefined,
  };

  // Only query when:
  //   - localStorage check is done (postcodeSyncResolved)
  //   - a postcode is present in the URL
  //   - the postcode passes the format check
  // Without all three, the query stays idle and the correct non-loading UI
  // state is shown instead.
  const queryEnabled = postcodeSyncResolved && !!postcode && postcodeIsValid;

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error, refetch } =
    useVendors(search, { enabled: queryEnabled });
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

  // "empty" is only meaningful once we have a valid postcode and the query
  // has settled. Without all three guards, an unresolved localStorage sync
  // or missing postcode would incorrectly trigger the waitlist/recommend UI.
  const empty = queryEnabled && !isLoading && !error && vendors.length === 0;

  const handleChangePostcode = () => {
    writeStoredPostcode(null);
    writeCoverageCookie(null);
    router.push('/');
  };

  const clearPostcodeFromUrl = () => {
    const next = new URLSearchParams(params?.toString() ?? '');
    next.delete('postcode');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <PageShell>
      <div className="space-y-5 py-5">
        <VendorResultsHero postcode={postcode ?? null} />

        {/* ── State 1: localStorage check pending → brief skeleton ──────── */}
        {!postcodeSyncResolved && (
          <div role="status" aria-live="polite">
            <span className="sr-only">Loading</span>
            <ul aria-hidden="true" className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i}>
                  <VendorCardSkeleton />
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ── State 2: no postcode → designed entry prompt ──────────────── */}
        {postcodeSyncResolved && !postcode && (
          <div className="flex flex-col items-center rounded-3xl border border-cream-deep bg-white px-6 py-14 text-center shadow-card">
            <span
              className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-light text-brand"
              aria-hidden
            >
              <MapPin className="h-7 w-7" strokeWidth={2.25} />
            </span>
            <h2 className="mb-2 font-display text-xl font-black text-charcoal">
              Where are you ordering from?
            </h2>
            <p className="mb-6 max-w-[280px] text-sm font-medium text-charcoal-mid">
              Enter your postcode to see home cooks delivering to you.
            </p>
            <form
              onSubmit={handlePostcodeSubmit}
              noValidate
              aria-label="Enter postcode"
              className="flex w-full max-w-xs flex-col gap-2"
            >
              <div>
                <label htmlFor="postcode-entry" className="sr-only">
                  Your postcode
                </label>
                <input
                  id="postcode-entry"
                  type="text"
                  value={postcodeEntry}
                  onChange={(e) => {
                    setPostcodeEntry(e.target.value);
                    setPostcodeEntryError('');
                  }}
                  placeholder="e.g. SE15 or SE15 4EE"
                  autoComplete="postal-code"
                  autoFocus
                  aria-describedby={postcodeEntryError ? 'postcode-entry-err' : undefined}
                  aria-invalid={!!postcodeEntryError}
                  className={`h-12 w-full rounded-xl border px-4 text-center text-sm font-medium text-charcoal outline-none focus:ring-2 focus:ring-brand/30 ${
                    postcodeEntryError
                      ? 'border-scotch bg-scotch/5'
                      : 'border-cream-deep bg-cream/50 focus:border-brand'
                  }`}
                />
                {postcodeEntryError && (
                  <p
                    id="postcode-entry-err"
                    role="alert"
                    className="mt-1.5 text-[12px] font-medium text-scotch"
                  >
                    {postcodeEntryError}
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="h-12 rounded-xl bg-brand text-sm font-bold text-white shadow-card transition hover:bg-brand-dark"
              >
                Find cooks near me
              </button>
            </form>
          </div>
        )}

        {/* ── State 3: postcode present but fails format check ─────────── */}
        {postcodeSyncResolved && postcode && !postcodeIsValid && (
          <div
            role="alert"
            className="flex flex-col items-center rounded-3xl border border-cream-deep bg-white px-6 py-12 text-center shadow-card"
          >
            <span
              className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-scotch/10 text-scotch"
              aria-hidden
            >
              <Search className="h-7 w-7" strokeWidth={2.25} />
            </span>
            <h2 className="mb-2 font-display text-xl font-black text-charcoal">
              That doesn&rsquo;t look like a UK postcode
            </h2>
            <p className="mb-5 max-w-[300px] text-sm font-medium text-charcoal-mid">
              <span className="font-bold text-charcoal">&ldquo;{postcode}&rdquo;</span> isn&rsquo;t
              a recognised format. Try something like{' '}
              <span className="font-medium text-charcoal">SE15</span> or{' '}
              <span className="font-medium text-charcoal">SE15 4EE</span>.
            </p>
            <button
              type="button"
              onClick={clearPostcodeFromUrl}
              className="touch-target rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
            >
              Try a different postcode
            </button>
          </div>
        )}

        {/* ── State 4: valid postcode - full search UI ─────────────────── */}
        {postcodeSyncResolved && postcode && postcodeIsValid && (
          <>
            <VendorSearchBar />
            <CategoryChips />

            <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="hidden lg:block">
                <VendorFiltersSidebar />
              </div>

              <div className="space-y-4">
                <VendorResultsHeader
                  count={vendors.length}
                  postcode={postcode}
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

                {/* Loading skeleton - only shown while a real fetch is in flight */}
                {isLoading && (
                  <div role="status" aria-live="polite">
                    <span className="sr-only">Loading vendors near {postcode.toUpperCase()}</span>
                    <ul aria-hidden="true" className="space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <li key={i}>
                          <VendorCardSkeleton />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Network / API error - distinct from empty state */}
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
                      Try a different dish name or browse all kitchens near{' '}
                      {postcode.toUpperCase()}.
                    </p>
                    <button
                      type="button"
                      onClick={() => router.replace(`/vendors?postcode=${postcode}`)}
                      className="touch-target rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
                    >
                      Browse all kitchens
                    </button>
                  </div>
                )}

                {/* No vendors serve this postcode - waitlist + recommend forms */}
                {empty && !q && (
                  <div className="rounded-3xl border border-cream-deep bg-white p-6 shadow-card sm:p-8">
                    <h2 className="font-display text-xl font-black text-charcoal sm:text-2xl">
                      Feastpot isn&rsquo;t serving {postcode.toUpperCase()} yet.
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm font-medium leading-relaxed text-charcoal-mid">
                      We open postcode by postcode so you only see cooks who can actually deliver
                      to you. Join the waitlist and tell us who you want to see on Feastpot.
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
                          initialPostcode={postcode}
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
          </>
        )}
      </div>

      {/*
        Sticky mobile bar - shows the active postcode above the BottomNav (z-40,
        bottom-0, 64px tall). Hidden on lg+ where the hero already shows it.
      */}
      {postcode && postcodeIsValid && (
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
          {/* Visual skeleton only - no "Loading vendors" announcement since
              we don't yet know whether a postcode will be present. The client
              component resolves quickly once JS hydrates. */}
          <div className="space-y-5 py-5" aria-hidden="true">
            <div className="h-32 rounded-3xl bg-cream" />
            <div className="h-14 rounded-2xl bg-cream" />
            <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
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
