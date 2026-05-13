import { ArrowLeft, Clock, ShoppingBag, Star, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FloatingBasketBar } from '@/components/basket/floating-basket-bar';
import { MenuCategoryTabs } from '@/components/menu/menu-category-tabs';
import { MenuItemCard } from '@/components/menu/menu-item-card';
import { RatingBreakdown } from '@/components/vendor/rating-breakdown';
import { ReviewsSection } from '@/components/vendor/reviews-section';
import { ApiError } from '@/lib/api/client';
import { getVendorBySlug, type VendorMenuItem } from '@/lib/api/vendors';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const formatPoundsRound = (p: number) => `£${Math.round(p / 100)}`;
const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const vendor = await getVendorBySlug(slug, { next: { revalidate: 300 } });
    return {
      title: vendor.businessName,
      description: vendor.description ?? `Order from ${vendor.businessName} on Feastpot.`,
      openGraph: {
        title: vendor.businessName,
        description: vendor.description ?? undefined,
        images: vendor.coverImageUrl ? [{ url: vendor.coverImageUrl }] : undefined,
      },
    };
  } catch {
    return { title: 'Vendor' };
  }
}

const CATEGORY_ORDER = [
  'tray',
  'soup',
  'protein',
  'swallow',
  'snack',
  'frozen',
  'bundle',
  'event',
] as const;
const CATEGORY_LABELS: Record<string, string> = {
  tray: 'Trays',
  soup: 'Soups',
  protein: 'Proteins',
  swallow: 'Swallows',
  snack: 'Snacks',
  frozen: 'Frozen',
  bundle: 'Bundles',
  event: 'Events',
};

function groupByCategory(items: VendorMenuItem[]) {
  const groups = new Map<string, VendorMenuItem[]>();
  for (const item of items) {
    const arr = groups.get(item.category) ?? [];
    arr.push(item);
    groups.set(item.category, arr);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => {
    const ai = (CATEGORY_ORDER as readonly string[]).indexOf(a);
    const bi = (CATEGORY_ORDER as readonly string[]).indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

/**
 * Vendor profile page (Server Component).
 *
 * Layout (PWA-03):
 *   1. Edge-to-edge cover hero with overlaid back arrow + logo chip.
 *   2. Vendor info card: name, rating (anchor to reviews), FSA badge,
 *      cuisine pills, min order, delivery summary.
 *   3. Sticky horizontal-scroll category tabs (MenuCategoryTabs).
 *   4. Menu sections grouped by category — each section anchored with
 *      `id="menu-cat-<key>"` and `scroll-margin-top` so tab clicks land
 *      below the topnav + tab strip rather than behind them.
 *   5. FloatingBasketBar (only visible when basket holds items for this
 *      vendor) — fixed above the bottom-nav.
 *   6. ReviewsSection (anchored as `#reviews` so the rating row scrolls
 *      to it).
 *
 * `app/layout.tsx` already wraps children in
 * `<main className="page-content mx-auto max-w-lg">`, so we don't add
 * PageShell here. We use `-mx-4` on the hero to bleed it edge-to-edge
 * inside the max-width container, then re-pad the inner content.
 */
export default async function VendorProfilePage({ params }: PageProps) {
  const { slug } = await params;

  let vendor;
  try {
    vendor = await getVendorBySlug(slug, { next: { revalidate: 60 } });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const allItems: VendorMenuItem[] = (vendor.menus ?? []).flatMap((m) => m.items ?? []);
  const grouped = groupByCategory(allItems);
  const categories = grouped.map(([key, items]) => ({
    key,
    label: CATEGORY_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1),
    count: items.length,
  }));

  const basketVendor = { id: vendor.id, name: vendor.businessName, slug: vendor.slug };
  const minOrderPence = vendor.delivery?.minOrderPence ?? null;

  return (
    <div className="px-4 pb-6">
      {/* HERO — bleeds edge-to-edge inside max-w-lg.
          Brand-DNA fallback: when no cover photo is uploaded (most early
          vendors), we render a rich scotch→pot→terracotta gradient with the
          tribal weave overlay and a single floating stew-pot glyph instead
          of the previous grey placeholder. The cover photo, when present,
          renders ON TOP of the gradient so the gradient is invisible — that
          way mature vendors with photography are unaffected, and brand-new
          vendors don't look like a missing-image error. */}
      <header className="relative -mx-4">
        <div
          className="relative h-52 w-full overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #3D1A0A 0%, #8B5E3C 50%, #E8520A 100%)',
          }}
        >
          {!vendor.coverImageUrl && (
            <>
              <div className="absolute inset-0 tribal-bg" style={{ opacity: 0.12 }} aria-hidden />
              <div
                aria-hidden
                className="pointer-events-none absolute top-6 right-8 select-none"
                style={{ fontSize: '48px', opacity: 0.2, transform: 'rotate(20deg)' }}
              >
                🍲
              </div>
            </>
          )}
          {vendor.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vendor.coverImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          {/* Bottom scrim improves logo + name legibility on busy photos. */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-dark/50 via-transparent to-dark/10" />
        </div>

        <Link
          href="/vendors"
          aria-label="Back to vendors"
          className="touch-target absolute left-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-dark shadow-sm backdrop-blur transition-colors hover:bg-white"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>

        {vendor.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vendor.logoUrl}
            alt=""
            className="absolute -bottom-6 left-4 h-16 w-16 rounded-2xl border-4 border-white object-cover shadow-card"
          />
        ) : null}
      </header>

      {/* VENDOR INFO CARD.
          The teal "Hygiene N/5" badge that used to sit next to the name is
          REPLACED by the more prominent Yam-Green FSA pill below the cook-
          identity card — the audit asked us to elevate the trust signal,
          not duplicate it. */}
      <section className="mt-9 space-y-2">
        <h1 className="text-[20px] font-bold leading-tight text-dark">{vendor.businessName}</h1>

        {vendor.rating > 0 && (
          <Link
            href="#reviews"
            className="inline-flex items-center gap-1 text-sm text-dark"
          >
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
            <span className="font-bold">{vendor.rating.toFixed(1)}</span>
            <span className="text-mid">({vendor.ratingCount} reviews)</span>
          </Link>
        )}

        {vendor.cuisines.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {vendor.cuisines.map((c) => (
              <li
                key={c}
                className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-dark"
              >
                {c}
              </li>
            ))}
          </ul>
        )}

        {/* Cook identity row — humanises the home cook (audit headline rec).
            Larger version of the avatar shown on vendor list cards: 44px
            terracotta-gradient circle with white border + soft brand shadow.
            "Cooking on Feastpot since {Month YYYY}" turns the createdAt
            date into a community-tenure signal rather than a cold timestamp. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px',
            background: '#FBF6EF',
            borderRadius: '12px',
            marginTop: '8px',
          }}
        >
          <div
            aria-hidden
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              flexShrink: 0,
              background: 'linear-gradient(135deg, #E8520A, #C8401F)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '14px',
              fontWeight: 800,
              border: '2px solid white',
              boxShadow: '0 2px 8px rgba(232,82,10,0.3)',
            }}
          >
            {vendor.businessName
              .split(' ')
              .map((w) => w[0] ?? '')
              .join('')
              .substring(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#1C1C1A', margin: '0 0 2px' }}>
              Home cook · {vendor.address?.city || 'South London'}
            </p>
            <p style={{ fontSize: '11px', color: '#5F5E5A', margin: 0 }}>
              Cooking on Feastpot since{' '}
              {new Date(vendor.createdAt).toLocaleDateString('en-GB', {
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>

        {/* Prominent FSA Hygiene pill — Yam-Green, sits as its own row so
            it isn't lost in the metrics chip-strip below. */}
        {typeof vendor.fsaRating === 'number' && vendor.fsaRating >= 4 && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              background: '#E8F5EB',
              color: '#3D7A47',
              padding: '5px 10px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              border: '1px solid #3D7A47',
              marginTop: '8px',
            }}
          >
            🛡️ FSA Hygiene {vendor.fsaRating}/5 — Verified
          </div>
        )}

        {vendor.description && (
          <p className="text-sm leading-relaxed text-mid">{vendor.description}</p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] text-mid">
          {minOrderPence != null && minOrderPence > 0 && (
            <span className="inline-flex items-center gap-1">
              <ShoppingBag className="h-3 w-3" aria-hidden />
              {formatPoundsRound(minOrderPence)} minimum order
            </span>
          )}
          {vendor.delivery && (
            <span className="inline-flex items-center gap-1">
              <Truck className="h-3 w-3" aria-hidden />
              {vendor.delivery.types.join(' · ')} · {vendor.delivery.localRadiusMiles}mi
            </span>
          )}
          {vendor.delivery?.freeDeliveryOverPence != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden />
              Free delivery over {formatPounds(vendor.delivery.freeDeliveryOverPence)}
            </span>
          )}
        </div>
      </section>

      {/* RATING BREAKDOWN — sits below the vendor info card so the trust
          signal is visible before the customer dives into the menu. The
          per-bucket counts aren't yet exposed by the API, so the component
          derives a deterministic visual estimate from `rating` + `ratingCount`
          and shows a small "estimated" footnote. */}
      {vendor.ratingCount > 0 && (
        <section className="mt-6">
          <RatingBreakdown avgRating={vendor.rating} reviewCount={vendor.ratingCount} />
        </section>
      )}

      {/* MENU */}
      <section className="mt-6">
        <MenuCategoryTabs categories={categories} />

        {grouped.length === 0 ? (
          <p className="mt-4 text-sm text-mid">This vendor hasn’t published a menu yet.</p>
        ) : (
          <div className="mt-4 space-y-6">
            {grouped.map(([category, items]) => (
              <section
                key={category}
                id={`menu-cat-${category}`}
                style={{ scrollMarginTop: 'calc(var(--page-safe-top) + 56px)' }}
                className="space-y-2"
              >
                {/* Sticky category header: parks just below the tab strip
                    (tabs are at var(--page-safe-top), strip is ~48px tall).
                    Negative -mx-4 + px-4 on the inner span lets the white
                    background extend edge-to-edge so menu cards don't bleed
                    through as the user scrolls past. */}
                <h2
                  style={{ top: 'calc(var(--page-safe-top) + 48px)' }}
                  className="sticky z-10 -mx-4 bg-white px-4 py-2 text-[15px] font-bold text-dark"
                >
                  {CATEGORY_LABELS[category] ?? category}
                </h2>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item.id}>
                      <MenuItemCard item={item} vendor={basketVendor} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      {/* REVIEWS */}
      <section
        id="reviews"
        style={{ scrollMarginTop: 'var(--page-safe-top)' }}
        className="mt-8 space-y-3"
      >
        <h2 className="text-[15px] font-bold text-dark">Reviews</h2>
        <ReviewsSection vendorId={vendor.id} limit={3} />
      </section>

      {/* FLOATING BAR — fixed, only renders when basket has items for this vendor */}
      <FloatingBasketBar vendorId={vendor.id} />
    </div>
  );
}
