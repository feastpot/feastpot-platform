import { KeyTermsSummary, RateCard } from '@feastpot/ui';

import { canonicalAnnexARates, canonicalAnnexCSummary } from '@/lib/canonical-vendor-terms';

/** All commercial presentation comes from the same immutable contract body. */
export function LegalLayers({ content }: { content: string }) {
  let rates;
  let terms;
  try {
    rates = canonicalAnnexARates(content);
    terms = canonicalAnnexCSummary(content);
  } catch {
    return (
      <p
        role="alert"
        className="my-6 rounded-2xl border border-cream-deep bg-white p-5 text-sm text-charcoal"
      >
        The current contract does not contain complete commercial annexes. Rate details are
        unavailable. Please contact Feastpot before relying on this document.
      </p>
    );
  }
  return (
    <div className="mb-10 grid min-w-0 scroll-mt-20 gap-4 lg:grid-cols-2">
      <KeyTermsSummary rates={rates} terms={terms} />
      <RateCard rates={rates} />
    </div>
  );
}
