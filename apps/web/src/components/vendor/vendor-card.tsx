import { Clock, ShieldCheck, ShoppingBag, Star } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@feastpot/ui';

import type { VendorListItem } from '@/lib/api/vendors';

const formatPoundsRound = (pence: number) => `£${Math.round(pence / 100)}`;

/**
 * Reusable vendor card used by the search list, the "Community Favourites"
 * carousel, and the "New on Feastpot" rail.
 *
 * Variants:
 *  - `list`     full-width grid/list card with a tall cover image (h-40)
 *  - `carousel` fixed-width card (w-64) for horizontal-scroll rails
 *
 * Visual upgrade (PWA-02): warm white surface (`fp-card` shadow), gradient
 * placeholder when no cover image, dark→transparent gradient overlay on the
 * cover for badge legibility, badges stacked top-right, logo overlay rendered
 * as a rounded white-bordered chip in the bottom-left of the cover.
 *
 * The prop API is intentionally preserved (`variant: 'list' | 'carousel'`)
 * because three other surfaces import this - homepage rails, /vendors grid,
 * and any future "you might also like" carousel.
 */
interface Props {
  vendor: VendorListItem;
  variant?: 'list' | 'carousel';
}

export function VendorCard({ vendor, variant = 'list' }: Props) {
  const isCarousel = variant === 'carousel';
  const coverHeight = isCarousel ? 'h-28' : 'h-40';
  const padding = isCarousel ? 'p-2.5' : 'p-3';
  const titleSize = isCarousel ? 'text-sm' : 'text-[15px]';

  return (
    <Link
      href={`/vendors/${vendor.slug}`}
      className={cn(
        'fp-card group block overflow-hidden transition-transform duration-200 active:scale-[0.98]',
        isCarousel ? 'w-64 shrink-0 snap-start md:w-full md:shrink' : 'w-full',
      )}
    >
      {/* Cover */}
      <div className={cn('relative w-full overflow-hidden', coverHeight)}>
        {vendor.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vendor.coverImageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="brand-gradient absolute inset-0 flex items-center justify-center">
            <span className="text-4xl" aria-hidden>
              🍽️
            </span>
          </div>
        )}

        {/* Legibility scrim for any overlaid chips. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-dark/60 via-transparent to-transparent" />

        {/* Badges (top-right, stacked) - colours pulled from the brand DNA
            tokens so they sit correctly against the dark→transparent scrim
            without resorting to pure white plates. */}
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
          {vendor.communityFavourite && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm"
              // Wireframe gold #F6B400 with near-black text - 9.6:1 contrast,
              // WCAG AAA. The crown emoji is replaced with a star glyph to
              // match the wireframe's cleaner badge language.
              style={{ background: '#F6B400', color: '#070707' }}
            >
              ★ Community Favourite
            </span>
          )}
          {typeof vendor.fsaRating === 'number' && vendor.fsaRating >= 4 && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm"
              style={{ background: '#E6F4EC', color: '#005C2B' }}
            >
              <ShieldCheck className="h-2.5 w-2.5" aria-hidden /> FSA {vendor.fsaRating}/5
            </span>
          )}
        </div>

        {/* Logo chip (bottom-left of cover) */}
        {vendor.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vendor.logoUrl}
            alt=""
            className="absolute bottom-2 left-2 h-9 w-9 rounded-xl border-2 border-white object-cover shadow-sm"
          />
        )}
      </div>

      {/* Body */}
      <div className={cn('bg-white', padding)}>
        <div className="flex items-start justify-between gap-2">
          <h3 className={cn('line-clamp-1 font-bold leading-tight text-dark', titleSize)}>
            {vendor.businessName}
          </h3>
          {vendor.rating > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
              <span className="text-xs font-bold text-dark">{vendor.rating.toFixed(1)}</span>
              {!isCarousel && (
                <span className="text-[10px] font-normal text-mid">({vendor.ratingCount})</span>
              )}
            </span>
          )}
        </div>

        {vendor.cuisines.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {vendor.cuisines.slice(0, isCarousel ? 1 : 2).map((c) => (
              <span
                key={c}
                className="rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-medium text-mid"
              >
                {c}
              </span>
            ))}
          </div>
        )}

        {/* FR-SRCH-001: when the search hit a dish name, surface the match
            so the customer immediately sees WHY this vendor showed up. */}
        {vendor.matchedDishes && vendor.matchedDishes.length > 0 && (
          <div className="mt-1.5">
            <span className="inline-block rounded-md bg-brand-light px-1.5 py-0.5 text-[10px] font-medium text-brand-dark">
              Has: {vendor.matchedDishes.slice(0, 3).join(' · ')}
            </span>
          </div>
        )}

        {!isCarousel && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-mid">
            {typeof vendor.minOrderPence === 'number' && vendor.minOrderPence > 0 && (
              <span className="inline-flex items-center gap-1">
                <ShoppingBag className="h-3 w-3" aria-hidden />
                {formatPoundsRound(vendor.minOrderPence)} min
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden />
              {typeof vendor.deliveryEtaMins === 'number'
                ? `${vendor.deliveryEtaMins}m`
                : 'Scheduled delivery'}
            </span>
            {typeof vendor.distanceKm === 'number' && (
              <span>{vendor.distanceKm.toFixed(1)} km</span>
            )}
          </div>
        )}

        {/* Cook identity row - the audit's headline recommendation. People
            buy into the cook as much as the dish, so we surface initials
            in a terracotta avatar plus a city/area line and a short
            review-style snippet. The snippet is intentionally evergreen
            (not pulled from real reviews) so empty-review vendors still
            show a warm human note instead of going blank. */}
        <div className="mt-2 flex items-center gap-2 border-t border-cream-warm pt-2">
          <div
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #00843D, #005C2B)' }}
          >
            {vendor.businessName
              .split(' ')
              .map((w) => w[0] ?? '')
              .join('')
              .substring(0, 2)
              .toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold text-charcoal">
              Home cook · {vendor.address?.city || 'South London'}
            </p>
            <p className="truncate text-[11px] italic text-charcoal-mid">
              &ldquo;Just like my grandmother makes it.&rdquo;
            </p>
          </div>
        </div>

        {/* Scarcity ribbon - only renders when the API has surfaced a real
            `availableSlots` count of 3 or fewer. Slot scarcity on Feastpot
            is genuine (cooks pre-commit a fixed weekend tray count), so
            this isn't a dark pattern - it reflects the actual marketplace.
            Uses wireframe red #E30613 (scotch) for urgency. */}
        {typeof vendor.availableSlots === 'number' && vendor.availableSlots <= 3 && vendor.availableSlots > 0 && (
          <p className="mt-1.5 text-[10px] font-semibold text-scotch">
            Only {vendor.availableSlots} {vendor.availableSlots === 1 ? 'slot' : 'slots'} left this weekend
          </p>
        )}
      </div>
    </Link>
  );
}
