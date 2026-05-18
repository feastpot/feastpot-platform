'use client';

import { Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Free-text search input for /vendors. URL is the source of truth: `value`
 * is local for snappy typing, but a 300 ms debounced effect mirrors it into
 * `?q=`. We deliberately do NOT push history entries - `replace` keeps the
 * back button useful (it returns to the previous *page*, not the previous
 * keystroke).
 */
export function VendorSearchInput() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = searchParams?.get('q') ?? '';
  const [value, setValue] = useState(initial);

  // Keep local state in sync if `q` changes from elsewhere (e.g. clearing
  // via the chip below the grid, or browser back).
  useEffect(() => {
    setValue(initial);
  }, [initial]);

  // Hold the latest router/params/pathname in refs so the debounced flush
  // always reads the freshest URL state, never a stale closure. This
  // prevents the bug where toggling cuisine/postcode within the 300 ms
  // debounce window would be overwritten by an outdated snapshot.
  const searchParamsRef = useRef(searchParams);
  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);
  searchParamsRef.current = searchParams;
  pathnameRef.current = pathname;
  routerRef.current = router;

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = value.trim();
      const sp = searchParamsRef.current;
      const current = sp?.get('q') ?? '';
      if (trimmed === current) return;
      const params = new URLSearchParams(sp?.toString() ?? '');
      if (trimmed) params.set('q', trimmed);
      else params.delete('q');
      const qs = params.toString();
      const path = pathnameRef.current ?? '/vendors';
      routerRef.current.replace(qs ? `${path}?${qs}` : path, { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-mid"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search for a dish or vendor…"
        aria-label="Search vendors and dishes"
        enterKeyHint="search"
        className="h-11 w-full rounded-xl border border-cream-deep bg-white pl-9 pr-9 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/60 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-charcoal-mid hover:bg-cream hover:text-charcoal"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
