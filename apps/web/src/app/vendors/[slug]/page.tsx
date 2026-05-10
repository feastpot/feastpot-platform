import { ShieldCheck, Star } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ApiError } from '@/lib/api/client';
import { getVendorBySlug, type VendorMenuItem } from '@/lib/api/vendors';
import { MenuItemCard } from '@/components/vendor/menu-item-card';
import { PageShell } from '@/components/layout/page-shell';
import { ReviewsSection } from '@/components/vendor/reviews-section';
import { StickyAddToOrder } from '@/components/vendor/sticky-add-to-order';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const formatPounds = (p: number) => `£${(p / 100).toFixed(2)}`;

/**
 * Server-rendered SEO metadata. Falls back to a generic title if the vendor
 * 404s so search bots don't see "undefined · Feastpot".
 */
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

/**
 * Display order for menu sections. Categories not in this list fall to the
 * end in their natural order.
 */
const CATEGORY_ORDER = ['tray', 'soup', 'protein', 'swallow', 'snack', 'frozen', 'bundle', 'event'] as const;
const CATEGORY_LABELS: Record<string, string> = {
  tray: 'Trays',
  soup: 'Soups',
  protein: 'Proteins',
  swallow: 'Swallows',
  snack: 'Snacks',
  frozen: 'Frozen Packs',
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

const spiceLevelOf = (tags: string[]): number =>
  tags.includes('spicy-3') ? 3 : tags.includes('spicy-2') ? 2 : tags.includes('spicy-1') ? 1 : 0;

export default async function VendorProfilePage({ params }: PageProps) {
  const { slug } = await params;

  let vendor;
  try {
    vendor = await getVendorBySlug(slug, { next: { revalidate: 60 } });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  // Flatten menus → menu items, then group by category for display.
  const allItems: VendorMenuItem[] = (vendor.menus ?? []).flatMap((m) => m.items ?? []);
  const grouped = groupByCategory(allItems);

  return (
    <PageShell>
      <article className="-mx-4 pb-6">
        {/* Cover + logo overlay */}
        <header className="relative">
          <div className="h-44 w-full bg-gradient-to-br from-brand-light to-brand/30 sm:h-52">
            {vendor.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={vendor.coverImageUrl} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          {vendor.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vendor.logoUrl}
              alt=""
              className="absolute -bottom-8 left-4 h-16 w-16 rounded-full border-2 border-background object-cover shadow"
            />
          ) : null}
        </header>

        <div className="px-4 pt-10">
          <h1 className="text-2xl font-bold tracking-tight">{vendor.businessName}</h1>

          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {vendor.rating > 0 && (
              <span className="inline-flex items-center gap-0.5 text-foreground">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" aria-hidden />
                {vendor.rating.toFixed(1)}
                <span className="text-xs text-muted-foreground">({vendor.ratingCount} reviews)</span>
              </span>
            )}
            {typeof vendor.fsaRating === 'number' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-teal-light px-1.5 py-0.5 text-xs text-teal-dark">
                <ShieldCheck className="h-3 w-3" aria-hidden /> FSA {vendor.fsaRating}
              </span>
            )}
          </div>

          {vendor.cuisines.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {vendor.cuisines.map((c) => (
                <li key={c} className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">
                  {c}
                </li>
              ))}
            </ul>
          )}

          {vendor.description && (
            <p className="mt-3 text-sm text-muted-foreground">{vendor.description}</p>
          )}
        </div>

        {/* Delivery info */}
        {vendor.delivery && (
          <section className="mx-4 mt-5 rounded-lg border border-border p-3 text-sm">
            <h2 className="text-sm font-semibold">Delivery &amp; collection</h2>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <dt className="font-medium text-foreground">Types</dt>
              <dd>{vendor.delivery.types.join(', ')}</dd>
              <dt className="font-medium text-foreground">Local radius</dt>
              <dd>{vendor.delivery.localRadiusMiles} miles</dd>
              <dt className="font-medium text-foreground">Min order</dt>
              <dd>{formatPounds(vendor.delivery.minOrderPence)}</dd>
              {vendor.delivery.freeDeliveryOverPence != null && (
                <>
                  <dt className="font-medium text-foreground">Free delivery over</dt>
                  <dd>{formatPounds(vendor.delivery.freeDeliveryOverPence)}</dd>
                </>
              )}
            </dl>
          </section>
        )}

        {/* Menu */}
        <section className="mx-4 mt-6 space-y-6">
          <h2 className="text-lg font-semibold tracking-tight">Menu</h2>
          {grouped.length === 0 && (
            <p className="text-sm text-muted-foreground">This vendor hasn&rsquo;t published a menu yet.</p>
          )}
          {grouped.map(([category, items]) => (
            <section key={category} className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {CATEGORY_LABELS[category] ?? category}
              </h3>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <MenuItemCard
                      item={item}
                      vendor={{ id: vendor.id, name: vendor.businessName, slug: vendor.slug }}
                      category={category}
                      spiceLevel={spiceLevelOf(item.tags)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </section>

        {/* Reviews */}
        <section className="mx-4 mt-8 space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Reviews</h2>
          <ReviewsSection vendorId={vendor.id} />
        </section>
      </article>

      <StickyAddToOrder vendorId={vendor.id} />
    </PageShell>
  );
}
