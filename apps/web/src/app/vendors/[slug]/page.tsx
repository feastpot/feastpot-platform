import {
  ChevronRight,
  Clock,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  Soup,
  Star,
  Truck,
} from 'lucide-react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FloatingBasketBar } from '@/components/basket/floating-basket-bar';
import { MenuCategoryTabs } from '@/components/menu/menu-category-tabs';
import { MenuItemCard } from '@/components/menu/menu-item-card';
import { CapacityBand } from '@/components/vendor/capacity-band';
import { CoverageBadge } from '@/components/vendor/coverage-badge';
import { MarketplaceTagger } from '@/components/vendor/marketplace-tagger';
import { RatingBreakdown } from '@/components/vendor/rating-breakdown';
import { ReviewsSection } from '@/components/vendor/reviews-section';
import { TrustSignalPanel } from '@/components/vendor/trust-signal-panel';
import { ApiError } from '@/lib/api/client';
import {
  getVendorBySlug,
  getVendorCapacity,
  getVendorTrustSignals,
  getVendorVerification,
  type CapacityDay,
  type VendorMenuItem,
  type VendorVerificationData,
  type VerifiedTrustSignal,
} from '@/lib/api/vendors';
import { VerificationPanel } from '@feastpot/ui';
import { COVERAGE_COOKIE } from '@/lib/postcode';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const formatPoundsRound = (p: number) => `£${Math.round(p / 100)}`;
const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const vendor = await getVendorBySlug(slug, { next: { revalidate: 300 } });

    // Fallback description (used when the vendor hasn't written their own bio
    // yet). Includes cuisine + city + a few menu items so every vendor page
    // ships a unique og:description string - Kwame's Jollof was flagged in
    // the live SEO audit for serving an empty description here.
    const cuisines = vendor.cuisines?.filter(Boolean).join(' & ');
    const city = vendor.address?.city ?? 'UK';
    const topDishes = vendor.menus
      ?.flatMap((m) => m.items ?? [])
      .slice(0, 3)
      .map((i) => i.name)
      .filter(Boolean)
      .join(', ');
    const fallback = [
      cuisines ? `${cuisines} home cooking in ${city}.` : `Home cooking in ${city}.`,
      topDishes ? `Dishes include: ${topDishes}.` : '',
      'Order party trays, frozen packs and more on Feastpot.',
    ]
      .filter(Boolean)
      .join(' ');
    const description = vendor.description?.trim() || fallback;

    return {
      title: vendor.businessName,
      description,
      openGraph: {
        title: vendor.businessName,
        description,
        images: vendor.coverImageUrl
          ? [{ url: vendor.coverImageUrl, width: 1200, height: 630 }]
          : undefined,
      },
    };
  } catch {
    return { title: 'Vendor' };
  }
}

/**
 * Category ordering matches the brief's prescribed sequence.
 * Keys are the values stored in VendorMenuItem.category (server-side).
 *
 * Brief categories without a backing category key:
 *   "Family pots"      → no `family_pots` key (DEF-018)
 *   "Rice dishes"      → no `rice` / `rice_dishes` key (DEF-019)
 *   "Sides"            → no `sides` key (DEF-020)
 * These will show as empty groups and are suppressed by groupByCategory.
 */
const CATEGORY_ORDER = [
  'tray',
  'snack',
  'soup',
  'protein',
  'swallow',
  'frozen',
  'bundle',
  'event',
] as const;
const CATEGORY_LABELS: Record<string, string> = {
  tray: 'Party trays',
  snack: 'Small chops',
  soup: 'Soups and stews',
  protein: 'Meat and fish',
  swallow: 'Swallows',
  frozen: 'Weekly meal prep',
  bundle: 'Bundles',
  event: 'Event catering',
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
 *   4. Menu sections grouped by category - each section anchored with
 *      `id="menu-cat-<key>"` and `scroll-margin-top` so tab clicks land
 *      below the topnav + tab strip rather than behind them.
 *   5. FloatingBasketBar (only visible when basket holds items for this
 *      vendor) - fixed above the bottom-nav.
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

  // Pull the customer's coverage postcode (the same one the homepage gate
  // stores) straight off the cookie so the profile can surface "X.X mi away"
  // - matching the badge already shown on the search list. Server-readable
  // cookie keeps this a single round-trip with no client hydration flicker.
  // Cookie value is URL-encoded by writeCoverageCookie; decode here.
  const cookieStore = await cookies();
  const rawPostcode = cookieStore.get(COVERAGE_COOKIE)?.value || null;
  // Guard decode: a tampered/malformed cookie shouldn't 500 the profile page.
  let customerPostcode: string | null = null;
  if (rawPostcode) {
    try {
      customerPostcode = decodeURIComponent(rawPostcode);
    } catch {
      customerPostcode = null;
    }
  }

  let vendor;
  try {
    // Skip the 60s revalidate cache when we have a postcode - the response
    // is per-customer (distanceKm depends on their postcode) and Next would
    // otherwise serve a stale distance to other visitors.
    vendor = await getVendorBySlug(slug, {
      postcode: customerPostcode,
      next: customerPostcode ? { revalidate: 0 } : { revalidate: 60 },
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      notFound();
    }
    throw e;
  }

  const distanceMiles =
    typeof vendor.distanceKm === 'number' && vendor.distanceKm >= 0
      ? vendor.distanceKm * 0.621371
      : null;

  // Trust signals, verification + capacity are additive - a failure on any
  // must never take down the profile page, so all fall back gracefully.
  let trustSignals: VerifiedTrustSignal[] = [];
  let capacity: CapacityDay[] = [];
  let verification: VendorVerificationData | null = null;
  try {
    const [signalsRes, capacityRes, verificationRes] = await Promise.all([
      getVendorTrustSignals(vendor.id, { next: { revalidate: 300 } }),
      getVendorCapacity(vendor.id, { next: { revalidate: 60 } }),
      getVendorVerification(vendor.id, { next: { revalidate: 300 } }),
    ]);
    trustSignals = signalsRes.signals;
    capacity = capacityRes.capacity;
    verification = verificationRes;
  } catch {
    // Additive data only - render the profile without it.
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
      {/* Breadcrumb - gives deep-linked visitors (Google / shared SMS)
          a visible Home → Browse → {vendor} trail before the visual
          chrome takes over. The TopNav back chevron handles single-step
          back; the breadcrumb covers the "where am I in the site" gap
          and provides per-segment links to either parent. -mx-4 lets it
          bleed edge-to-edge so the warm cream strip reads as a chrome
          band rather than a card. */}
      <nav aria-label="Breadcrumb" className="-mx-4 border-b border-cream-deep bg-cream px-4 py-2">
        <ol className="flex items-center gap-1 text-[12px] font-medium text-charcoal-mid">
          <li>
            <Link href="/" className="transition-colors hover:text-brand">
              Home
            </Link>
          </li>
          <li aria-hidden="true" className="flex items-center">
            <ChevronRight className="h-3 w-3" aria-hidden />
          </li>
          <li>
            <Link href="/vendors" className="transition-colors hover:text-brand">
              Browse
            </Link>
          </li>
          <li aria-hidden="true" className="flex items-center">
            <ChevronRight className="h-3 w-3" aria-hidden />
          </li>
          <li aria-current="page" className="min-w-0 truncate font-bold text-charcoal">
            {vendor.businessName}
          </li>
        </ol>
      </nav>

      {/* HERO - bleeds edge-to-edge inside max-w-lg.
          Brand-DNA fallback: when no cover photo is uploaded (most early
          vendors), we render a rich scotch→pot→terracotta gradient with the
          tribal weave overlay and a single floating stew-pot glyph instead
          of the previous grey placeholder. The cover photo, when present,
          renders ON TOP of the gradient so the gradient is invisible - that
          way mature vendors with photography are unaffected, and brand-new
          vendors don't look like a missing-image error. */}
      <header className="relative -mx-4">
        <div
          className="relative h-52 w-full overflow-hidden"
          style={{
            // Wireframe palette - brand green deepens into the darker
            // forest with a gold radial accent in the top-right so empty
            // covers read as "Feastpot" rather than "missing image".
            background:
              'radial-gradient(circle at 80% 20%, #F6B400 0%, transparent 45%), linear-gradient(135deg, #005C2B 0%, #00843D 100%)',
          }}
        >
          {!vendor.coverImageUrl && (
            <div
              aria-hidden
              className="pointer-events-none absolute right-6 top-6 grid h-16 w-16 place-items-center rounded-2xl bg-white/15 text-white/80 backdrop-blur"
            >
              <Soup className="h-8 w-8" strokeWidth={1.75} />
            </div>
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
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-charcoal/50 via-transparent to-charcoal/10" />
        </div>

        {/* The hero-overlay back arrow that previously sat here was
            removed - TopNav now ships a global back chevron on every
            inner page, and the breadcrumb above gives a textual
            fallback. Two visible back affordances on the same view
            invite confusion (Deliveroo / UberEats both ship one). */}

        {vendor.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vendor.logoUrl}
            alt=""
            className="absolute -bottom-6 left-4 h-16 w-16 rounded-2xl border-4 border-white object-cover shadow-card"
          />
        ) : null}
      </header>

      {/* Trust signals (T2) + this week's capacity (T4) - both render null
          when the vendor has nothing verified / no partially-booked dates,
          so most vendors see no change here. */}
      {(trustSignals.length > 0 || capacity.length > 0) && (
        <div className="mt-9 space-y-3">
          <TrustSignalPanel
            signals={trustSignals}
            fsaRating={vendor.fsaRating}
            ratingCount={vendor.ratingCount > 0 ? vendor.ratingCount : undefined}
          />
          <CapacityBand capacity={capacity} />
        </div>
      )}

      {/* VENDOR INFO CARD.
          The teal "Hygiene N/5" badge that used to sit next to the name is
          REPLACED by the more prominent Yam-Green FSA pill below the cook-
          identity card - the audit asked us to elevate the trust signal,
          not duplicate it. */}
      <section className="mt-9 space-y-3">
        <h1 className="font-display text-[24px] font-black leading-tight text-charcoal">
          {vendor.businessName}
        </h1>

        {vendor.rating > 0 && (
          <Link
            href="#reviews"
            className="inline-flex items-center gap-1 text-sm text-charcoal transition-colors hover:text-brand"
          >
            <Star className="h-4 w-4 fill-plantain text-plantain" aria-hidden />
            <span className="font-bold">{vendor.rating.toFixed(1)}</span>
            <span className="text-charcoal-mid">({vendor.ratingCount} reviews)</span>
          </Link>
        )}

        {vendor.cuisines.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {vendor.cuisines.map((c) => (
              <li
                key={c}
                className="rounded-full bg-cream-warm px-2.5 py-1 text-xs font-bold text-charcoal"
              >
                {c}
              </li>
            ))}
          </ul>
        )}

        {/* Cook identity row - humanises the home cook (audit headline
            rec). Wireframe palette: green-gradient avatar on cream-warm
            card. "Cooking on Feastpot since {Month YYYY}" turns the
            createdAt into a community-tenure signal. */}
        <div className="flex items-center gap-3 rounded-2xl bg-cream-warm p-3">
          <div
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white text-sm font-black text-white shadow-card"
            style={{ background: 'linear-gradient(135deg, #00843D, #005C2B)' }}
          >
            {vendor.businessName
              .split(' ')
              .map((w) => w[0] ?? '')
              .join('')
              .substring(0, 2)
              .toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-bold text-charcoal">
              Home cook · {vendor.address?.city || 'UK'}
            </p>
            <p className="text-[11px] font-medium text-charcoal-mid">
              Cooking on Feastpot since{' '}
              {new Date(vendor.createdAt).toLocaleDateString('en-GB', {
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>

        {/* Prominent FSA Hygiene pill - wireframe brand-green palette,
            sits as its own row so it isn't lost in the metrics
            chip-strip below. Lucide shield replaces emoji. */}
        {typeof vendor.fsaRating === 'number' && vendor.fsaRating >= 4 && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-brand bg-brand-light px-3 py-1 text-[11px] font-bold text-brand-dark">
            <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            FSA Hygiene {vendor.fsaRating}/5 - Verified
          </div>
        )}

        {vendor.description && (
          <p className="text-sm font-medium leading-relaxed text-charcoal-mid">
            {vendor.description}
          </p>
        )}

        {/* T005: specialities surface as pills below the cuisine row so
            customers can scan what this kitchen is known for at a glance. */}
        {vendor.specialities && vendor.specialities.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {vendor.specialities.map((s) => (
              <li
                key={s}
                className="rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1 text-xs font-bold text-brand-dark"
              >
                {s}
              </li>
            ))}
          </ul>
        )}

        {/* Featured dishes: resolved from menu-item IDs by the API.
            `featuredDishDetails` carries the canonical names; fall back to
            the raw `featuredDishes` array for any legacy free-text values. */}
        {(() => {
          const details: Array<{ id: string; name: string }> =
            (vendor as { featuredDishDetails?: Array<{ id: string; name: string }> })
              .featuredDishDetails ?? [];
          const names =
            details.length > 0 ? details.map((d) => d.name) : (vendor.featuredDishes ?? []);
          if (names.length === 0) return null;
          return (
            <div className="rounded-2xl bg-cream-warm p-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
                Featured dishes
              </p>
              <ul className="mt-1.5 space-y-1 text-sm font-medium text-charcoal">
                {names.map((name) => (
                  <li key={name}>· {name}</li>
                ))}
              </ul>
            </div>
          );
        })()}

        {/* T005: long-form vendor story. */}
        {vendor.vendorStory && (
          <details className="rounded-2xl border border-cream-deep bg-white p-3">
            <summary className="cursor-pointer text-sm font-bold text-charcoal">
              About this kitchen
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-charcoal-mid">
              {vendor.vendorStory}
            </p>
          </details>
        )}

        {/* T005: social links. Rendered as a compact link strip, opening in
            a new tab with noopener/noreferrer for safety. */}
        {vendor.socialLinks && Object.keys(vendor.socialLinks).length > 0 && (
          <ul className="flex flex-wrap gap-2 pt-1 text-xs font-bold">
            {Object.entries(vendor.socialLinks).map(([k, v]) => (
              <li key={k}>
                <a
                  href={v}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-charcoal/15 px-2.5 py-1 text-charcoal transition-colors hover:bg-cream-warm"
                >
                  {k}
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] font-medium text-charcoal-mid">
          {distanceMiles != null && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" aria-hidden />
              {distanceMiles.toFixed(1)} mi away
            </span>
          )}
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
          {/* UK DMCC Act 2024 first-price disclosure: service fee must be
              visible at the same point the customer first sees item prices. */}
          <span className="inline-flex items-center gap-1">
            <span aria-hidden>+</span>
            Up to £2.99 service fee applies
          </span>
        </div>

        {/* Delivery coverage badge - uses the server-computed distance (set
            only when the customer has a saved coverage postcode) against the
            vendor's local delivery radius, so customers see up-front whether
            this kitchen actually delivers to them. */}
        <div>
          <CoverageBadge
            distanceMiles={distanceMiles}
            radiusMiles={vendor.delivery?.localRadiusMiles ?? null}
            deliveryType={vendor.delivery?.types?.[0] ?? 'local'}
            hasPostcode={Boolean(customerPostcode)}
          />
        </div>
      </section>

      {/* RATING BREAKDOWN - sits below the vendor info card so the trust
          signal is visible before the customer dives into the menu. Bars use
          the REAL per-star counts from the profile API (`ratingBreakdown`);
          the component only falls back to its labelled estimate if the field
          is ever absent. */}
      {vendor.ratingCount > 0 && (
        <section className="mt-6">
          <RatingBreakdown
            avgRating={vendor.rating}
            reviewCount={vendor.ratingCount}
            breakdown={vendor.ratingBreakdown}
          />
        </section>
      )}

      {/* VERIFICATION PANEL - above the menu so customers see compliance
          evidence before adding items to their basket. Only rendered when
          the vendor has a verification record. Never gated on any paid tier. */}
      {verification && (
        <section className="mt-6">
          <VerificationPanel verification={verification} reviewCount={vendor.ratingCount} />
        </section>
      )}

      {/* MENU */}
      <section className="mt-6">
        <MenuCategoryTabs categories={categories} />

        {grouped.length === 0 ? (
          <p className="mt-4 text-sm font-medium text-charcoal-mid">
            This kitchen hasn’t published a menu yet.
          </p>
        ) : (
          <div className="mt-4 space-y-6">
            {grouped.map(([category, items], idx) => (
              <section
                key={category}
                id={`menu-cat-${category}`}
                style={{ scrollMarginTop: 'calc(var(--page-safe-top) + 56px)' }}
                className="space-y-2"
              >
                <h2
                  style={{ top: 'calc(var(--page-safe-top) + 48px)' }}
                  className="sticky z-10 -mx-4 flex items-center gap-2.5 bg-cream px-4 py-2 font-display text-[17px] font-black text-charcoal"
                >
                  <span
                    aria-label={`Category ${idx + 1}`}
                    role="img"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-charcoal text-[11px] font-black text-white"
                  >
                    {idx + 1}
                  </span>
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

      {/* DELIVERED BY THE VENDOR - fulfilment attribution below the menu */}
      <section
        aria-label="Delivery information"
        className="mt-8 rounded-2xl border border-cream-deep bg-cream-warm/60 p-5"
      >
        <h2 className="flex items-center gap-2 font-display text-[16px] font-black text-charcoal">
          <Truck className="h-4 w-4 text-brand" aria-hidden />
          Delivered by the vendor
        </h2>
        <p className="mt-1.5 text-[13.5px] font-medium leading-relaxed text-charcoal-mid">
          This vendor delivers your order directly. The delivery fee is set by the vendor and shown
          before you pay.
        </p>
      </section>

      {/* REVIEWS */}
      <section
        id="reviews"
        style={{ scrollMarginTop: 'var(--page-safe-top)' }}
        className="mt-8 space-y-3"
      >
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-brand">
          From verified orders
        </p>
        <h2 className="font-display text-[20px] font-black text-charcoal">Verified reviews</h2>
        <ReviewsSection vendorId={vendor.id} limit={3} />
      </section>

      {/* FLOATING BAR - fixed, only renders when basket has items for this vendor */}
      <FloatingBasketBar vendorId={vendor.id} />
      {/* MARKETPLACE ATTRIBUTION TAGGER - sets fp_mp_{vendorId} cookie on mount so
          the attribution system knows this customer browsed via marketplace */}
      <MarketplaceTagger vendorId={vendor.id} />
    </div>
  );
}
