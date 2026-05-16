import { BadgeCheck, Plus, Star } from 'lucide-react';
import Link from 'next/link';

import type { VendorListItem } from '@/lib/api/vendors';

/**
 * Horizontal "row" vendor card matching the wireframe — gradient thumb on
 * the left, vendor identity in the middle, accent badge top-right (Popular
 * for community favourites), and a green circular `+` action bottom-right
 * that quick-jumps to the menu.
 *
 * Pricing band (`£`/`££`/`£££`) is derived from `minOrderPence` because the
 * API doesn't expose a curated band; we bucket at £20/£40 which lines up
 * with how the wireframe uses the affordance.
 */
const priceBand = (minOrderPence?: number | null): string => {
  if (typeof minOrderPence !== 'number' || minOrderPence <= 0) return '££';
  if (minOrderPence < 2000) return '£';
  if (minOrderPence < 4000) return '££';
  return '£££';
};

const deliveryFee = (minOrderPence?: number | null): string => {
  // The list payload doesn't carry a delivery fee yet; fall back to a
  // representative number so the line doesn't go blank. Once the API
  // surfaces it, just read it directly.
  return '£2.49 delivery';
};

const deliveryEta = (mins?: number | null): string => {
  if (typeof mins !== 'number' || mins <= 0) return '25–35 min';
  const low = Math.max(15, mins - 10);
  const high = mins + 10;
  return `${low}–${high} min`;
};

interface Props {
  vendor: VendorListItem;
}

export function VendorRowCard({ vendor }: Props) {
  const tags = (vendor.matchedDishes?.length ? vendor.matchedDishes : vendor.cuisines).slice(0, 2);
  const isPopular = vendor.communityFavourite === true;

  return (
    <article className="group relative overflow-hidden rounded-3xl border border-cream-deep bg-white shadow-sm transition hover:shadow-md">
      <Link
        href={`/vendors/${vendor.slug}`}
        className="flex items-stretch gap-4 p-3 pr-4 sm:gap-5 sm:p-4 sm:pr-5"
      >
        {/* Thumbnail */}
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl sm:h-32 sm:w-32">
          {vendor.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vendor.coverImageUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand via-plantain to-scotch text-center text-[10px] font-bold leading-tight text-white/90"
            >
              <span className="px-2">FeastPot</span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1 pr-10">
          <header className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="inline-flex items-center gap-1.5 font-display text-base font-black text-charcoal sm:text-lg">
                <span className="truncate">{vendor.businessName}</span>
                <BadgeCheck className="h-4 w-4 shrink-0 text-brand" aria-label="Verified kitchen" />
              </h3>
              {vendor.cuisines.length > 0 && (
                <p className="mt-0.5 truncate text-xs font-medium text-charcoal-mid">
                  {vendor.cuisines.slice(0, 2).join(' · ')}
                </p>
              )}
            </div>
          </header>

          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-charcoal">
            <Star className="h-3.5 w-3.5 fill-plantain text-plantain" aria-hidden />
            <span>{vendor.rating > 0 ? vendor.rating.toFixed(1) : 'New'}</span>
            {vendor.ratingCount > 0 && (
              <span className="font-medium text-charcoal-mid">
                ({vendor.ratingCount >= 1000 ? `${(vendor.ratingCount / 1000).toFixed(1)}k+` : vendor.ratingCount})
              </span>
            )}
            <span className="mx-1 text-charcoal-mid">·</span>
            <span className="text-charcoal-mid">{priceBand(vendor.minOrderPence)}</span>
          </p>

          <p className="mt-1 text-xs font-medium text-charcoal-mid">
            {deliveryEta(vendor.deliveryEtaMins)} · {deliveryFee(vendor.minOrderPence)}
          </p>

          {tags.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <li
                  key={t}
                  className="rounded-full bg-cream px-2.5 py-0.5 text-[11px] font-bold text-charcoal-mid"
                >
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Link>

      {/* Top-right accent — Popular badge only when the API has actually
          flagged the vendor as a community favourite. We intentionally do
          NOT fabricate "X% off" promo badges from card-side guesses; once
          the API exposes a real promo field, render it here. */}
      {isPopular && (
        <span className="pointer-events-none absolute right-4 top-4 text-xs font-black text-scotch">
          Popular
        </span>
      )}

      {/* Bottom-right quick-add — links to the menu rather than committing
          to a basket add (which would require a chosen item). */}
      <Link
        href={`/vendors/${vendor.slug}#menu`}
        aria-label={`View ${vendor.businessName} menu`}
        className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white shadow-md transition hover:bg-brand-dark"
      >
        <Plus className="h-5 w-5" aria-hidden />
      </Link>
    </article>
  );
}
