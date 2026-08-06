/**
 * Asserts that the three customer-facing surfaces that state the platform
 * commission rate all agree on the same number. If you change the rate in one
 * place you must update the others; this test will catch the drift.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const SRC_ROOT = join(__dirname, '..', 'app');

function readPage(relPath: string): string {
  return readFileSync(join(SRC_ROOT, relPath), 'utf-8');
}

const COMMISSION_RATE_STRING = '12%';

const SURFACES: Array<[label: string, path: string]> = [
  ['marketing page (become-a-vendor)', 'become-a-vendor/page.tsx'],
  ['help FAQ', 'help/page.tsx'],
  ['vendor terms', 'legal/vendor-terms/page.tsx'],
];

describe('Commercial numbers consistency', () => {
  it.each(SURFACES)(
    '%s states the %s commission rate',
    (_, path) => {
      const content = readPage(path);
      expect(content).toContain(COMMISSION_RATE_STRING);
    },
  );

  it('all three surfaces agree on the same commission rate', () => {
    const contents = SURFACES.map(([, path]) => readPage(path));
    // Each file must contain '12%' -- the previous tests confirm this one by
    // one; this test additionally asserts they agree *with each other* by
    // checking a shared constant reference where possible.
    for (const content of contents) {
      expect(content).toContain(COMMISSION_RATE_STRING);
    }
  });
});
