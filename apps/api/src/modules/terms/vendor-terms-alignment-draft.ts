import { createHash } from 'crypto';

import { COMMISSION_RATES } from '@feastpot/config/commission-rates';
import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

/** A review draft only. This must never be inserted around publishVersion's gates. */
export function buildVendorTermsAlignmentDraft(base: string, version: string) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('A numeric new version is required.');
  if (
    !base.includes('## Annex A') ||
    !base.includes('## Annex C') ||
    !base.includes('**Commission rate.**')
  )
    throw new Error('The canonical contract structure changed; review it before drafting.');

  const rates = [
    [
      'Marketplace, first order with a vendor',
      `${COMMISSION_RATES.marketplaceFirst.percent}%`,
      'Food subtotal only',
    ],
    [
      'Marketplace, repeat order with the same vendor',
      `${COMMISSION_RATES.marketplaceRepeat.percent}%`,
      'Food subtotal only',
    ],
    [
      'Vendor-referred food orders',
      `${COMMISSION_RATES.vendorReferred.percent}%`,
      'Food subtotal only',
    ],
    [
      'Catering, Feastpot-sourced client',
      `${COMMISSION_RATES.catering.percent}%`,
      COMMISSION_RATES.catering.basis,
    ],
    [
      'Catering, client brought by the vendor',
      `${COMMISSION_RATES.cateringVendorReferred.percent}%`,
      COMMISSION_RATES.cateringVendorReferred.basis,
    ],
    [
      'Customer service fee',
      `${PLATFORM_FACTS.serviceFee.percent}% capped at GBP ${(PLATFORM_FACTS.serviceFee.capPence / 100).toFixed(2)}`,
      'Order subtotal; charged to the customer, not deducted from vendor payout',
    ],
  ];
  const annexA = [
    '## Annex A -- Rate Schedule',
    '',
    '| Segment | Rate | Basis | Status |',
    '|---------|------|-------|--------|',
    ...rates.map((row) => `| ${row.join(' | ')} | Live |`),
    '',
  ].join('\n');
  let contentMdx = base.replace(
    /^\*Version [^\n]+\*$/m,
    `*Version ${version} | Effective date subject to approved publication | England and Wales*`,
  );
  contentMdx = contentMdx.replace(
    /^\*\*Commission rate\.\*\*[^\n]+/m,
    '**Commission rate.** Commission rates and their calculation bases for every order source are set out in Annex A. Commission is deducted from your weekly payout; the customer service fee is charged to the customer and is not deducted from your payout.',
  );
  contentMdx = contentMdx.replace(
    /^- \*\*Commission\.\*\*[^\n]+/m,
    '- **Commission.** Catering commission and its source-specific calculation basis are set out in Annex A.',
  );
  contentMdx = contentMdx.replace(/^## Annex A\b[\s\S]*?(?=^## Annex B\b)/m, annexA + '\n');
  contentMdx = contentMdx.replace(
    /^- \*\*Commission\*\*:[^\n]+/m,
    '- **Commission**: Marketplace first orders, repeat orders, vendor-referred food orders and both catering sources are charged at their respective rates and calculation bases in Annex A; the customer service fee is charged to the customer, not deducted from vendor payout.',
  );
  contentMdx = contentMdx.replace(/\u2014/g, '--');
  return {
    documentType: 'VENDOR_TERMS' as const,
    version,
    contentMdx,
    contentHash: createHash('sha256').update(contentMdx, 'utf8').digest('hex'),
    isMaterial: true,
    solicitorSignOff: 'PENDING - solicitor approval has not been obtained.',
    publicationReady: false,
    proposedEffectiveTreatment:
      'Immediate for new acceptances; affirmative re-acceptance and notice-period waiver for existing vendors, subject to solicitor review.',
    changeSummary:
      'Aligns all commission statements and Annex A with the confirmed food-order and catering rates and customer-only capped service fee from the configured Rate Schedule. The proposed immediate effect rests on an express P2B notice-period waiver through affirmative re-acceptance by existing vendors, because the user reports that no vendor is live and the change lowers rates. That legal basis requires solicitor review. Review is PENDING; neither the approval gate nor the material-change notice gate has been bypassed. The currently served document uses clause 3 for commission and contains no clause 5.2; numbering requires review.',
  };
}
