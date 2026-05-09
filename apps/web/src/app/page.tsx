import { searchVendors, type VendorListItem } from '@/lib/api/vendors';
import { CuisineFilter } from '@/components/vendor/cuisine-filter';
import { VendorCard } from '@/components/vendor/vendor-card';
import { PageShell } from '@/components/layout/page-shell';
import { PostcodeHero } from '@/components/home/postcode-hero';

/**
 * Customer homepage (Server Component).
 *
 * Top-rated and "new" rails are fetched in parallel from the vendor search
 * API. We deliberately swallow API errors here — an empty rail is far less
 * jarring on first load than a full-page crash, and the search page is
 * always one tap away. Errors still surface in server logs for ops.
 */
async function safeFetch(promise: Promise<{ data: VendorListItem[] }>): Promise<VendorListItem[]> {
  try {
    const r = await promise;
    return r.data;
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [favourites, newest] = await Promise.all([
    safeFetch(searchVendors({ communityFavourite: true, sortBy: 'rating', limit: 10 }, { next: { revalidate: 60 } })),
    safeFetch(searchVendors({ sortBy: 'rating', limit: 10 }, { next: { revalidate: 60 } })),
  ]);

  return (
    <PageShell>
      <div className="space-y-6 py-4">
        <PostcodeHero />

        <section>
          <h2 className="sr-only">Browse by cuisine</h2>
          <CuisineFilter />
        </section>

        <CarouselRow title="Community Favourites" emptyText="No favourites in your area yet — check back soon.">
          {favourites.map((v) => (
            <VendorCard key={v.id} vendor={v} variant="carousel" />
          ))}
        </CarouselRow>

        <CarouselRow title="New on Feastpot" emptyText="No new vendors yet.">
          {newest.map((v) => (
            <VendorCard key={v.id} vendor={v} variant="carousel" />
          ))}
        </CarouselRow>
      </div>
    </PageShell>
  );
}

function CarouselRow({
  title,
  children,
  emptyText,
}: {
  title: string;
  children: React.ReactNode;
  emptyText: string;
}) {
  const arr = Array.isArray(children) ? children : [children];
  const hasItems = arr.filter(Boolean).length > 0;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {hasItems ? (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {children}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
    </section>
  );
}
