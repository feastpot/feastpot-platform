'use client';

import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';
import type { ReactNode } from 'react';

const LEGAL_PAGES = [
  { segment: 'privacy', href: '/legal/privacy', title: 'Privacy Policy' },
  { segment: 'terms', href: '/legal/terms', title: 'Terms of Service' },
  { segment: 'vendor-terms', href: '/legal/vendor-terms', title: 'Vendor Terms' },
  { segment: 'cookies', href: '/legal/cookies', title: 'Cookie Policy' },
  { segment: 'allergens', href: '/legal/allergens', title: 'Allergen Information' },
] as const;

export default function LegalLayout({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment();
  const current = LEGAL_PAGES.find((p) => p.segment === segment);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-foreground hover:underline">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          {current ? (
            <>
              <li>
                <span className="hover:text-foreground">Legal</span>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-foreground" aria-current="page">
                {current.title}
              </li>
            </>
          ) : (
            <li className="text-foreground" aria-current="page">
              Legal
            </li>
          )}
        </ol>
      </nav>

      <div className="mt-4 grid gap-8 md:mt-6 md:grid-cols-[220px_minmax(0,1fr)] md:gap-10">
        <aside className="md:sticky md:top-24 md:self-start">
          {/* Mobile: horizontal scrolling tabs. */}
          <div className="-mx-4 overflow-x-auto px-4 md:hidden">
            <ul className="flex gap-2 whitespace-nowrap pb-2">
              {LEGAL_PAGES.map((p) => {
                const active = p.segment === segment;
                return (
                  <li key={p.href}>
                    <Link
                      href={p.href}
                      aria-current={active ? 'page' : undefined}
                      className={
                        active
                          ? 'inline-block rounded-full border border-brand bg-brand px-3 py-1.5 text-sm font-medium text-white'
                          : 'inline-block rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted'
                      }
                    >
                      {p.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Desktop: vertical sidebar. */}
          <ul className="hidden space-y-1 md:block">
            {LEGAL_PAGES.map((p) => {
              const active = p.segment === segment;
              return (
                <li key={p.href}>
                  <Link
                    href={p.href}
                    aria-current={active ? 'page' : undefined}
                    className={
                      active
                        ? 'block rounded-md bg-muted px-3 py-2 text-sm font-semibold text-foreground'
                        : 'block rounded-md px-3 py-2 text-sm text-foreground hover:bg-muted'
                    }
                  >
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="min-w-0">
          {children}

          <footer className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
            <p>Last updated: May 2026</p>
            <p className="mt-1">
              Questions? Email{' '}
              <a
                href="mailto:privacy@feastpot.co.uk"
                className="text-brand underline hover:no-underline"
              >
                privacy@feastpot.co.uk
              </a>
              .
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
