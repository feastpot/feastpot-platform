import type { Metadata } from 'next';

import { CanonicalDocument } from '@/components/legal/canonical-document';
import {
  LegalContentWrapper,
  LegalHero,
  LegalPageShell,
  LegalQuickNav,
  LegalSection,
} from '@/components/legal/legal-shell';
import {
  documentSections,
  fetchCanonicalVendorTerms,
  sectionId,
} from '@/lib/canonical-vendor-terms';
import { API_URL } from '@/lib/env';

import { LegalLayers } from './legal-layers';
import { PrintButton } from './print-button';
import { TermsVersionBadge } from './version-badge';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Vendor Terms of Service',
  description:
    'Your canonical commercial agreement with Feastpot Ltd, including its Rate Schedule.',
  alternates: { canonical: '/legal/vendor-terms' },
};

const iconFor = (title: string) =>
  /relationship/i.test(title)
    ? '🤝'
    : /commission|payout/i.test(title)
      ? '🏦'
      : /dispute|liability/i.test(title)
        ? '⚖️'
        : /chargeback/i.test(title)
          ? '💳'
          : /eligibility/i.test(title)
            ? '✅'
            : /compliance|safety/i.test(title)
              ? '🛡️'
              : /data/i.test(title)
                ? '🔐'
                : /suspension/i.test(title)
                  ? '🛑'
                  : /rank/i.test(title)
                    ? '📊'
                    : /changes/i.test(title)
                      ? '📝'
                      : /acceptance/i.test(title)
                        ? '⏱️'
                        : /prohibited/i.test(title)
                          ? '🚫'
                          : /governing law/i.test(title)
                            ? '🏛️'
                            : '📋';

export default async function VendorTermsPage() {
  // One uncached response owns the badge, signed body, Annex A and Annex C.
  // Never combine a historical agreement with an independently current rate card.
  const terms = await fetchCanonicalVendorTerms(API_URL);
  const sections = documentSections(terms.contentMdx);
  const introduction = terms.contentMdx.split(/^## /m)[0] ?? '';
  return (
    <LegalPageShell>
      <LegalHero
        title="Vendor Terms"
        lede="Your commercial agreement with Feastpot Ltd when you list and sell food on the platform, weekly payouts, plain rules."
        footnote={<>England &amp; Wales</>}
      />
      <LegalQuickNav
        ariaLabel="Vendor terms sections"
        items={sections.map(({ title }) => ({
          label: title.replace(/^\d+\.\s*/, ''),
          href: `#${sectionId(title)}`,
        }))}
      />
      <div className="mx-auto min-w-0 max-w-5xl px-5 sm:px-8 lg:px-12">
        <LegalLayers content={terms.contentMdx} />
      </div>
      <LegalContentWrapper>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <TermsVersionBadge version={terms} />
          <PrintButton />
        </div>
        <article data-version-id={terms.id} data-content-hash={terms.contentHash}>
          <CanonicalDocument content={introduction} />
          {sections.map(({ title, content }) => (
            <LegalSection key={title} id={sectionId(title)} icon={iconFor(title)} title={title}>
              {/^\s*Annex A\b/i.test(title) && sectionId(title) !== 'annex-a' && (
                <span id="annex-a" aria-hidden="true" className="scroll-mt-24" />
              )}
              <CanonicalDocument content={content} />
            </LegalSection>
          ))}
        </article>
      </LegalContentWrapper>
    </LegalPageShell>
  );
}
