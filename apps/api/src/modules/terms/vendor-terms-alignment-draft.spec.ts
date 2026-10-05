import { COMMISSION_RATES } from '@feastpot/config/commission-rates';
import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

import { buildVendorTermsAlignmentDraft } from './vendor-terms-alignment-draft';

const base = `# Feastpot Vendor Terms
*Version 2.0 | Effective: September 2026 | England and Wales*
## 3. Payouts and commission
**Commission rate.** 12% and 10%.
## 13. Changes to these terms
Feastpot gives at least 15 days notice.
## 15. Catering bookings
- **Commission.** Standard marketplace commission.
## Annex A -- Rate Schedule
| Tier | Commission rate | Applies when |
|------|-----------------|-------------|
| New vendor | 12% | Default |
## Annex B -- Required Documents
Keep this annex unchanged.
## Annex C -- Key Terms Summary
- **Commission**: 12% and 10%.
`;

describe('Vendor Terms alignment review draft', () => {
  it('Annex A equals the financial engine configuration across all six segments', () => {
    const draft = buildVendorTermsAlignmentDraft(base, '2.2');
    const annex = draft.contentMdx.split('## Annex A')[1].split('## Annex B')[0];
    const rows = annex
      .split('\n')
      .filter((line) => /^\|/.test(line))
      .slice(2)
      .map((line) =>
        line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      );
    expect(rows.map((row) => Number(row[1].match(/^(\d+)%/)?.[1]))).toEqual([
      COMMISSION_RATES.marketplaceFirst.percent,
      COMMISSION_RATES.marketplaceRepeat.percent,
      COMMISSION_RATES.vendorReferred.percent,
      COMMISSION_RATES.catering.percent,
      COMMISSION_RATES.cateringVendorReferred.percent,
      PLATFORM_FACTS.serviceFee.percent,
    ]);
    expect(rows.map((row) => row[3])).toEqual(Array(6).fill('Live'));
    expect(rows[5][1]).toContain((PLATFORM_FACTS.serviceFee.capPence / 100).toFixed(2));
    expect(rows[5][2]).toContain('not deducted from vendor payout');
    expect(draft.contentMdx).not.toMatch(/12%|10% with trading/);
    expect(draft.contentMdx).toContain('Keep this annex unchanged.');
    expect(base).toContain('12% and 10%');
  });

  it('keeps solicitor review pending, the change material and waiver treatment unapproved', () => {
    const draft = buildVendorTermsAlignmentDraft(base, '2.2');
    expect(draft.solicitorSignOff).toMatch(/^PENDING/);
    expect(draft.publicationReady).toBe(false);
    expect(draft.isMaterial).toBe(true);
    expect(draft.changeSummary).toContain('express P2B notice-period waiver');
    expect(draft.contentMdx).toContain('Feastpot gives at least 15 days notice.');
    expect(draft.contentMdx).not.toContain(String.fromCharCode(8212));
    expect(draft.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
