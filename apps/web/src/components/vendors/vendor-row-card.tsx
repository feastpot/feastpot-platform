import { Star } from 'lucide-react';
import Link from 'next/link';

import { CapacityPill } from '@/components/vendor/capacity-pill';
import {
  TRUST_SIGNAL_LABELS,
  TrustSignalBadge,
  orderTrustSignalsForCards,
} from '@/components/vendor/trust-signal-badge';
import type { CapacityDay, VendorListItem, VerifiedTrustSignal } from '@/lib/api/vendors';

/**
 * Horizontal "row" vendor card for the /vendors results list.
 *
 * Shows: cover image · vendor name · cuisine tags · rating + review count ·
 * delivery area (distance) · minimum order value · up to three dish/cuisine
 * tags · trust signal badges · "View menu" action.
 *
 * "Popular dishes" uses matchedDishes (from free-text search) or cuisines as
 * a proxy — the list endpoint does not return a dedicated popular-dishes field.
 * Up to three tags are shown; the badge row renders only when trust signals or
 * capacity data are available.
 */
const formatMinOrder = (minOrderPence?: number | null): string | null => {
  if (typeof minOrderPence !== 'number' || minOrderPence <= 0) return null;
  const pounds = minOrderPence / 100;
  return `Min. order £${Number.isInteger(pounds) ? pounds : pounds.toFixed(2)}`;
};

const deliveryEta = (mins?: number | null): string => {
  if (typeof mins !== 'number' || mins <= 0) return '25–35 min';
  const low = Math.max(15, mins - 10);
  const high = mins + 10;
  return `${low}–${high} min`;
};

const KM_PER_MILE = 1.609344;
const formatDistanceMiles = (km?: number | null): string | null => {
  if (typeof km !== 'number' || !Number.isFinite(km) || km < 0) return null;
  const miles = km / KM_PER_MILE;
  return `${miles.toFixed(1)} mi away`;
};

interface Props {
  vendor: VendorListItem;
  /** Verified trust signals from the batch card-extras endpoint. */
  trustSignals?: VerifiedTrustSignal[];
  /** 7-day capacity rows from the batch card-extras endpoint. */
  capacity?: CapacityDay[];
}

export function VendorRowCard({ vendor, trustSignals, capacity }: Props) {
  // Up to three dish/cuisine tags: prefer matched dishes from free-text search,
  // fall back to the vendor's cuisine list.
  const tags = (vendor.matchedDishes?.length ? vendor.matchedDishes : vendor.cuisines).slice(0, 3);
  const isPopular = vendor.communityFavourite === true;
  const distanceLabel = formatDistanceMiles(vendor.distanceKm);
  const minOrderLabel = formatMinOrder(vendor.minOrderPence);

  // At most two badges, priority reliable_orders → event_catering_experience
  // → first verified alphabetically.
  const badgeTypes = orderTrustSignalsForCards(trustSignals).slice(0, 2);

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
        <div className="min-w-0 flex-1 pb-1 pr-2">
          <header className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display text-base font-black text-charcoal sm:text-lg">
                <span className="truncate">{vendor.businessName}</span>
              </h3>
              {vendor.cuisines.length > 0 && (
                <p className="mt-0.5 truncate text-xs font-medium text-charcoal-mid">
                  {vendor.cuisines.slice(0, 2).join(' · ')}
                </p>
              )}
            </div>
          </header>

          {/* Rating + price band */}
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-charcoal">
            <Star className="h-3.5 w-3.5 fill-plantain text-plantain" aria-hidden />
            <span>{vendor.rating > 0 ? vendor.rating.toFixed(1) : 'New'}</span>
            {vendor.ratingCount > 0 && (
              <span className="font-medium text-charcoal-mid">
                (
                {vendor.ratingCount >= 1000
                  ? `${(vendor.ratingCount / 1000).toFixed(1)}k+`
                  : vendor.ratingCount}
                )
              </span>
            )}
          </p>

          {/* Delivery ETA + min order */}
          <p className="mt-1 text-xs font-medium text-charcoal-mid">
            {deliveryEta(vendor.deliveryEtaMins)}
            {minOrderLabel && (
              <>
                <span className="mx-1">·</span>
                {minOrderLabel}
              </>
            )}
          </p>

          {/* Trust signal badges + capacity */}
          {(badgeTypes.length > 0 || capacity) && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {badgeTypes.map((t) => (
                <TrustSignalBadge key={t} signalType={t} label={TRUST_SIGNAL_LABELS[t]} />
              ))}
              <CapacityPill capacity={capacity} />
            </p>
          )}

          {/* Distance */}
          {distanceLabel && (
            <p className="mt-1.5">
              <span className="inline-flex items-center rounded-full bg-teal/10 px-2 py-0.5 text-[11px] font-bold text-teal">
                {distanceLabel}
              </span>
            </p>
          )}

          {/* Tags: up to 3 dish/cuisine labels */}
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

      {/* Popular badge */}
      {isPopular && (
        <span className="pointer-events-none absolute right-4 top-4 text-xs font-black text-scotch">
          Popular
        </span>
      )}

      {/* "View menu" action — visible text on sm+, icon-only on narrowest screens */}
      <Link
        href={`/vendors/${vendor.slug}#menu`}
        aria-label={`View ${vendor.businessName} menu`}
        className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-2 text-[11px] font-bold text-white shadow-md transition hover:bg-brand-dark sm:px-4 sm:text-xs"
      >
        <span aria-hidden className="text-sm font-black leading-none">
          +
        </span>
        <span className="hidden sm:inline">View menu</span>
      </Link>
    </article>
  );
}
