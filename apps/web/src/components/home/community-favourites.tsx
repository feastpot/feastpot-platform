import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { VendorCard } from '@/components/vendor/vendor-card';
import type { VendorListItem } from '@/lib/api/vendors';

interface Props {
  vendors: VendorListItem[];
}

/**
 * Horizontal-scroll "Community Favourites" rail used on the homepage.
 *
 * Server component — relies on `VendorCard` also being a server component
 * (no `'use client'` in the card source). Returns null when empty rather
 * than rendering an empty rail; the parent decides whether to show a
 * fallback message.
 *
 * Scrollbar-hiding uses the project's arbitrary-variant pattern
 * (`[scrollbar-width:none] [&::-webkit-scrollbar]:hidden`) instead of a
 * `scrollbar-hide` plugin class — keeps zero extra dependencies and matches
 * `app/page.tsx`'s existing CarouselRow.
 */
export function CommunityFavourites({ vendors }: Props) {
  if (vendors.length === 0) return null;

  return (
    <section className="space-y-2 py-2">
      <header className="flex items-end justify-between gap-2 px-4">
        <div>
          <h2 className="text-[17px] font-bold text-dark">🔥 Community Favourites</h2>
          <p className="mt-0.5 text-xs text-mid">Top-rated by people in your area</p>
        </div>
        <Link
          href="/vendors?communityFavourite=true"
          className="inline-flex items-center gap-0.5 text-sm font-semibold text-brand"
        >
          See all
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </header>

      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {vendors.map((vendor) => (
          <VendorCard key={vendor.id} vendor={vendor} variant="carousel" />
        ))}
      </div>
    </section>
  );
}
