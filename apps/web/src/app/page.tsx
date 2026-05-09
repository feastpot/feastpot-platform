import Link from 'next/link';

import { PageShell } from '@/components/layout/page-shell';

/**
 * Customer home (placeholder). Real implementation will surface "Near you",
 * "Community favourites", and saved vendors — wired up once the catalogue
 * query layer lands.
 */
export default function HomePage() {
  return (
    <PageShell>
      <section className="space-y-6 py-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Welcome to Feastpot</h1>
          <p className="text-muted-foreground">
            Bulk meals from your community&rsquo;s best home cooks.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-brand-light p-5">
          <h2 className="text-base font-semibold text-brand-dark">Discover vendors near you</h2>
          <p className="mt-1 text-sm text-brand-dark/80">
            Search by cuisine, browse community favourites, or pre-order for the weekend.
          </p>
          <Link
            href="/search"
            className="mt-3 inline-flex items-center rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Start exploring
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
