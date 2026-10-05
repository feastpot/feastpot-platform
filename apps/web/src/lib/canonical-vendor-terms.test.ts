import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  canonicalAnnexARates,
  canonicalAnnexCSummary,
  canonicalTermsNotice,
  documentSections,
} from './canonical-vendor-terms';

const content = `# Vendor terms
## 3. Commission
See Annex A.
## 13. Changes to these terms
Feastpot will give you a minimum of 15 days notice.

Further notice conditions.
## Annex A -- Rate Schedule
| Segment | Rate | Basis | Status |
|---------|------|-------|--------|
| Marketplace, first order with a vendor | 8% | Food subtotal | Live |
| Customer service fee | 5% capped at GBP 2.99 | Customer only | Live |
## Annex C -- Key Terms Summary
- **Commission**: All sources use Annex A.
- **Notice**: 15 days.
`;

test('the badge, body and presentation receive one uncached canonical response', () => {
  const page = readFileSync(resolve(__dirname, '../app/legal/vendor-terms/page.tsx'), 'utf8');
  expect(page).toContain("cache: 'no-store'");
  expect(page).toContain('version={terms}');
  expect(page).toContain('content={terms.contentMdx}');
  expect(page).toContain('documentSections(terms.contentMdx)');
  expect(page).not.toContain('PLATFORM_FACTS.commission');
});

test('Annex A is parsed from the signed document, not an independent current schedule', () => {
  const rows = canonicalAnnexARates(content);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ key: 'standard_commission', rateValue: 8, status: 'LIVE' });
  expect(rows[1]).toMatchObject({
    key: 'customer_service_fee',
    rateDisplay: '5% capped at GBP 2.99',
  });
  expect(canonicalAnnexARates(content.replace('8%', '12%'))[0]!.rateValue).toBe(12);
  expect(() => canonicalAnnexARates('# Missing annex')).toThrow('no Annex A');
});

test('Annex C and the application notice retain canonical wording', () => {
  expect(canonicalAnnexCSummary(content)).toEqual([
    'Commission: All sources use Annex A.',
    'Notice: 15 days.',
  ]);
  expect(canonicalTermsNotice(content)).toBe('Feastpot will give you a minimum of 15 days notice.');
  expect(documentSections(content)).toHaveLength(4);
  expect(() => canonicalTermsNotice('# No notice')).toThrow('no change-notice clause');
});
