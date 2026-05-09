'use client';

import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { normalisePostcode, useStoredPostcode } from '@/lib/postcode';

/**
 * Hero block on the customer homepage. Captures a UK postcode, persists it to
 * localStorage so we can default subsequent visits, then routes to the
 * vendor search page with the postcode in the URL (so search results are
 * shareable and survive a hard refresh).
 */
export function PostcodeHero() {
  const router = useRouter();
  const [stored, setStored] = useStoredPostcode();
  const [value, setValue] = useState<string>(stored ?? '');

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const pc = normalisePostcode(value);
    if (!pc) return;
    setStored(pc);
    router.push(`/vendors?postcode=${encodeURIComponent(pc)}`);
  };

  return (
    <section className="rounded-2xl bg-brand-light px-5 py-8 text-brand-dark">
      <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
        Authentic African &amp; Caribbean food, delivered.
      </h1>
      <p className="mt-2 text-sm text-brand-dark/80">
        Bulk meals from your community&rsquo;s best home cooks. Pre-order for the weekend or order today.
      </p>

      <form onSubmit={onSubmit} className="mt-5 flex gap-2" role="search" aria-label="Find vendors by postcode">
        <label htmlFor="hero-postcode" className="sr-only">
          UK postcode
        </label>
        <input
          id="hero-postcode"
          type="text"
          inputMode="text"
          autoComplete="postal-code"
          placeholder="Enter your postcode"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1 rounded-md border border-brand/20 bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-dark"
        >
          <Search className="h-4 w-4" aria-hidden /> Find
        </button>
      </form>
    </section>
  );
}
