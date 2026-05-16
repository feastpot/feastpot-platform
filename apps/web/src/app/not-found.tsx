import Link from 'next/link';

import { PageShell } from '@/components/layout/page-shell';

export const metadata = {
  title: 'Page not found',
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <PageShell>
      <div className="space-y-6 py-16 text-center">
        <p className="font-display text-7xl font-black tracking-tight text-brand">404</p>
        <div className="space-y-2">
          <h1 className="font-display text-2xl font-black tracking-tight text-charcoal">
            We couldn&rsquo;t find that page
          </h1>
          <p className="mx-auto max-w-sm text-sm font-medium text-charcoal-mid">
            The link may have moved, or the kitchen you were looking for is no longer on
            Feastpot. Try one of these instead.
          </p>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark"
          >
            Browse kitchens
          </Link>
          <Link
            href="/help"
            className="inline-flex items-center justify-center rounded-xl border border-cream-deep bg-white px-6 py-3 text-sm font-bold text-charcoal transition hover:bg-cream"
          >
            Get help
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
