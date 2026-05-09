import { Clock, ShieldCheck, Star } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@feastpot/ui';

import type { VendorListItem } from '@/lib/api/vendors';

const formatPounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;

/**
 * Reusable vendor card used by the search list, the "Community Favourites"
 * carousel, and the "New on Feastpot" rail. `variant="carousel"` gives a
 * fixed-width version suitable for horizontal scroll containers; the default
 * is a full-width list card.
 */
interface Props {
  vendor: VendorListItem;
  variant?: 'list' | 'carousel';
}

export function VendorCard({ vendor, variant = 'list' }: Props) {
  const isCarousel = variant === 'carousel';
  return (
    <Link
      href={`/vendors/${vendor.slug}`}
      className={cn(
        'group block overflow-hidden rounded-xl border border-border bg-background shadow-sm transition hover:shadow-md',
        isCarousel ? 'w-64 shrink-0 snap-start' : 'w-full',
      )}
    >
      {/* Cover */}
      <div className="relative h-32 w-full bg-gradient-to-br from-brand-light to-brand/30">
        {vendor.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vendor.coverImageUrl}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : null}
        {vendor.communityFavourite && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white shadow">
            <Star className="h-3 w-3 fill-current" aria-hidden /> Community Favourite
          </span>
        )}
        {vendor.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vendor.logoUrl}
            alt=""
            className="absolute -bottom-5 left-3 h-12 w-12 rounded-full border-2 border-background object-cover shadow"
          />
        ) : null}
      </div>

      <div className={cn('p-3 pt-4', vendor.logoUrl && 'pl-3')}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold text-foreground">{vendor.businessName}</h3>
          {vendor.rating > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-foreground">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
              {vendor.rating.toFixed(1)}
              <span className="text-xs font-normal text-muted-foreground">({vendor.ratingCount})</span>
            </span>
          )}
        </div>

        {vendor.cuisines.length > 0 && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {vendor.cuisines.join(' • ')}
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {typeof vendor.fsaRating === 'number' && (
            <span className="inline-flex items-center gap-1 rounded-md bg-teal-light px-1.5 py-0.5 text-teal-dark">
              <ShieldCheck className="h-3 w-3" aria-hidden /> FSA {vendor.fsaRating}
            </span>
          )}
          {typeof vendor.minOrderPence === 'number' && vendor.minOrderPence > 0 && (
            <span>Min {formatPounds(vendor.minOrderPence)}</span>
          )}
          {typeof vendor.deliveryEtaMins === 'number' && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden /> {vendor.deliveryEtaMins}m
            </span>
          )}
          {typeof vendor.distanceKm === 'number' && (
            <span>{vendor.distanceKm.toFixed(1)} km</span>
          )}
        </div>
      </div>
    </Link>
  );
}
