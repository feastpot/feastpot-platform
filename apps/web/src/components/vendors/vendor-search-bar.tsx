'use client';

import { Search } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/**
 * Pill search bar for /vendors. Visually matches the wireframe - large
 * rounded white field with a prominent green "Search" button glued to the
 * right edge - but functionally identical to the older VendorSearchInput it
 * replaces: keystrokes are debounced (300 ms) into `?q=` so the back button
 * and shareable URLs both keep working. The submit button just flushes the
 * pending value immediately for users who prefer to commit explicitly.
 */
export function VendorSearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = searchParams?.get('q') ?? '';
  const [value, setValue] = useState(initial);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  const searchParamsRef = useRef(searchParams);
  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);
  searchParamsRef.current = searchParams;
  pathnameRef.current = pathname;
  routerRef.current = router;

  const flush = (next: string) => {
    const trimmed = next.trim();
    const sp = searchParamsRef.current;
    const current = sp?.get('q') ?? '';
    if (trimmed === current) return;
    const params = new URLSearchParams(sp?.toString() ?? '');
    if (trimmed) {
      params.set('q', trimmed);
      // Free-text search overrides the merchandising chip - keeping both
      // would create a confusing implicit AND ("Party trays AND jollof")
      // that doesn't match either UI affordance.
      params.delete('category');
    } else {
      params.delete('q');
    }
    const qs = params.toString();
    const path = pathnameRef.current ?? '/vendors';
    routerRef.current.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  };

  useEffect(() => {
    const timer = setTimeout(() => flush(value), 300);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        flush(value);
      }}
      className="flex items-center gap-2 rounded-2xl border border-cream-deep bg-white p-1.5 shadow-sm focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15"
    >
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-mid"
          aria-hidden
        />
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Search jollof, egusi, jerk, small chops…"
          aria-label="Search vendors and dishes"
          enterKeyHint="search"
          className="h-10 w-full rounded-xl bg-transparent pl-9 pr-3 text-sm font-medium text-charcoal placeholder:text-charcoal-mid/70 outline-none"
        />
      </div>
      <button
        type="submit"
        className="touch-target shrink-0 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark"
      >
        Search
      </button>
    </form>
  );
}
