import { ArrowLeft, Clock, ShieldCheck, ShoppingBag, Star, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FloatingBasketBar } from '@/components/basket/floating-basket-bar';
import { MenuCategoryTabs } from '@/components/menu/menu-category-tabs';
import { MenuItemCard } from '@/components/menu/menu-item-card';
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
      {/* HERO — bleeds edge-to-edge inside max-w-lg */}
      <header className="relative -mx-4">
        <div className="relative h-52 w-full overflow-hidden bg-gradient-to-br from-brand-light to-brand/30">
          {vendor.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vendor.coverImageUrl}
              alt=""
              className="h-full w-full object-cover"
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

      {/* VENDOR INFO CARD */}
      <section className="mt-9 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[20px] font-bold leading-tight text-dark">{vendor.businessName}</h1>
          {typeof vendor.fsaRating === 'number' && vendor.fsaRating >= 4 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal px-2 py-0.5 text-[10px] font-bold text-white">
              <ShieldCheck className="h-3 w-3" aria-hidden /> Hygiene {vendor.fsaRating}/5
            </span>
          )}
        </div>

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
