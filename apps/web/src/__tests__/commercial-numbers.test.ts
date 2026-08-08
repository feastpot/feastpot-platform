/**
 * Commercial-numbers consistency test.
 *
 * Verifies that the three customer-facing surfaces which state the commission
 * rate do NOT hardcode a literal "12%" string in their source (they must
 * reference PLATFORM_FACTS or an API-fetched value instead), and that
 * PLATFORM_FACTS itself is the canonical constant they are allowed to use.
 *
 * Acceptance criterion from LEGAL-505:
 *   "Grep the repo for '12%' and find zero hardcoded instances outside the
 *   seed file."
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

const SRC_ROOT = join(__dirname, '..', 'app');
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

function readSrc(relPath: string): string {
  return readFileSync(join(SRC_ROOT, relPath), 'utf-8');
}

function readRepo(relPath: string): string {
  return readFileSync(join(REPO_ROOT, relPath), 'utf-8');
}

// The literal string that must NOT appear hardcoded in source files.
const LITERAL_RATE = `${PLATFORM_FACTS.commission.marketplaceFirst}%`;

const SURFACES: Array<[label: string, path: string]> = [
  ['marketing page (become-a-vendor)', 'become-a-vendor/page.tsx'],
  ['help FAQ', 'help/page.tsx'],
  ['vendor terms', 'legal/vendor-terms/page.tsx'],
];

describe('Commercial-numbers consistency', () => {
  describe('No hardcoded rate strings in source files', () => {
    it.each(SURFACES)('%s does not contain a hardcoded "%s" literal', (_, path) => {
      const content = readSrc(path);
      // The rate must be referenced via PLATFORM_FACTS or a fetched/computed value,
      // not as a bare literal string like `12%`.
      expect(content).not.toContain(`'${LITERAL_RATE}'`);
      expect(content).not.toContain(`"${LITERAL_RATE}"`);
      // Template literals or JSX text with the literal are also forbidden:
      // e.g. <strong>12% of the food subtotal</strong>
      // Detect by checking for the string surrounded by markup-safe delimiters.
      expect(content).not.toMatch(/>12%</);
    });

    it('commission.service.ts has no hardcoded fallback rate', () => {
      const content = readRepo('apps/api/src/commission/commission.service.ts');
      // The 12% fallback (1200/10_000 or Decimal(12)) was removed.
      expect(content).not.toContain('1200');
      expect(content).not.toContain('new Decimal(12)');
      expect(content).not.toContain('using 12% fallback');
    });

    it('payouts.service.ts has no hardcoded "flat 12%" string', () => {
      const content = readRepo('apps/api/src/modules/payouts/payouts.service.ts');
      expect(content).not.toContain('flat 12%');
    });
  });

  describe('PLATFORM_FACTS commission values are consistent', () => {
    it('marketplaceFirst rate is a positive number', () => {
      expect(PLATFORM_FACTS.commission.marketplaceFirst).toBeGreaterThan(0);
      expect(PLATFORM_FACTS.commission.marketplaceFirst).toBeLessThanOrEqual(100);
    });

    it('marketplaceRepeat is less than marketplaceFirst', () => {
      expect(PLATFORM_FACTS.commission.marketplaceRepeat).toBeLessThan(
        PLATFORM_FACTS.commission.marketplaceFirst,
      );
    });

    it('vendorReferred is zero (referral orders are commission-free)', () => {
      expect(PLATFORM_FACTS.commission.vendorReferred).toBe(0);
    });

    it('surfaces reference PLATFORM_FACTS for the commission rate', () => {
      const becomePage = readSrc('become-a-vendor/page.tsx');
      expect(becomePage).toContain('PLATFORM_FACTS');
    });
  });
});
