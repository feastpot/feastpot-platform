/**
 * Platform facts consistency suite.
 *
 * Asserts that PLATFORM_FACTS is the single source of truth and that key
 * pages have not drifted from it. The test reads source files as text so
 * it catches copy-paste drift without needing to render a Next.js app.
 *
 * FAIL = a commercial fact or policy number has been changed in one place
 *        only. Fix by updating PLATFORM_FACTS and all usages together.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

const ROOT = join(__dirname, '../../../');

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('PLATFORM_FACTS - shape and values', () => {
  it('commission rates are positive and in expected range', () => {
    expect(PLATFORM_FACTS.commission.marketplaceFirst).toBeGreaterThan(0);
    expect(PLATFORM_FACTS.commission.marketplaceFirst).toBeLessThanOrEqual(100);
    expect(PLATFORM_FACTS.commission.marketplaceRepeat).toBeLessThan(
      PLATFORM_FACTS.commission.marketplaceFirst,
    );
  });

  it('vendor requirements include the FHRS minimum', () => {
    const hasFhrs = PLATFORM_FACTS.vendorRequirements.some((r) =>
      r.toLowerCase().includes('fhrs'),
    );
    expect(hasFhrs).toBe(true);
  });

  it('appeal window is 14 calendar days (RED-102)', () => {
    expect(PLATFORM_FACTS.appealWindowDays).toBe(14);
  });

  it('support hours are defined and non-empty', () => {
    expect(PLATFORM_FACTS.support.hours.length).toBeGreaterThan(0);
  });

  it('WhatsApp channel is null (not publicly active)', () => {
    expect(PLATFORM_FACTS.support.whatsapp).toBeNull();
  });
});

describe('Help page - consistency with PLATFORM_FACTS', () => {
  const src = read('apps/web/src/app/help/page.tsx');

  it('does not direct vendors to email as the only signup route', () => {
    // D2: the application form is canonical; email is a fallback only
    expect(src).not.toMatch(/Email partners@feastpot\.co\.uk.*we onboard/i);
  });

  it('includes the FHRS requirement in the document list', () => {
    // D3: FHRS 3+ must appear alongside the other documents
    expect(src).toMatch(/FHRS/i);
  });

  it('sources support hours from PLATFORM_FACTS, not a hardcoded string', () => {
    // Hardcoded "Monday to Saturday" without PLATFORM_FACTS reference is a drift risk
    expect(src).toContain('PLATFORM_FACTS');
    // The page must NOT contain the old hardcoded hours string without PLATFORM_FACTS
    expect(src).not.toMatch(/"Monday to Saturday"/);
  });

  it('does not render a WhatsApp link (channel is inactive)', () => {
    // D6: bare wa.me link was present; removed since PLATFORM_FACTS.support.whatsapp = null
    expect(src).not.toContain('wa.me');
  });
});

describe('Vendor terms - policy numbers match PLATFORM_FACTS', () => {
  const src = read('apps/web/src/app/legal/vendor-terms/page.tsx');

  it('states the correct appeal window in calendar days', () => {
    expect(src).toContain(`${PLATFORM_FACTS.appealWindowDays} calendar days`);
  });
});

describe('Benefits strip - no hardcoded support hours', () => {
  // D2: BenefitsStrip moved to packages/ui; the apps/web file is now a thin re-export.
  // The substantive test targets the canonical source in packages/ui.
  const src = read('packages/ui/src/components/benefits-strip.tsx');

  it('imports support hours from PLATFORM_FACTS', () => {
    expect(src).toContain('PLATFORM_FACTS');
    expect(src).not.toMatch(/'Email support, Monday to Saturday'/);
  });
});

describe('Become-a-vendor page - commission references PLATFORM_FACTS', () => {
  const src = read('apps/web/src/app/become-a-vendor/page.tsx');

  it('uses PLATFORM_FACTS for the commission rate, not a hardcoded string', () => {
    expect(src).toContain('PLATFORM_FACTS.commission.marketplaceFirst');
  });
});

describe('Vendor portal - contact email consistency', () => {
  // All vendor-facing pages that show compliance@ must reference PLATFORM_FACTS
  // so a single change in platform-facts.ts propagates everywhere.
  it('terms-client: compliance email from PLATFORM_FACTS, not hardcoded', () => {
    const src = read('apps/vendor/src/app/terms/terms-client.tsx');
    expect(src).toContain('PLATFORM_FACTS');
    expect(src).not.toContain('compliance@feastpot.co.uk');
  });

  it('compliance-client: compliance email from PLATFORM_FACTS, not hardcoded', () => {
    const src = read('apps/vendor/src/app/compliance/compliance-client.tsx');
    expect(src).toContain('PLATFORM_FACTS');
    expect(src).not.toContain('compliance@feastpot.co.uk');
  });

  it('close-account page: compliance email from PLATFORM_FACTS, not hardcoded', () => {
    const src = read('apps/vendor/src/app/settings/close-account/page.tsx');
    expect(src).toContain('PLATFORM_FACTS');
    expect(src).not.toContain('compliance@feastpot.co.uk');
  });

  it('tax-information-client: compliance email from PLATFORM_FACTS, not hardcoded', () => {
    const src = read('apps/vendor/src/app/tax-information/tax-information-client.tsx');
    expect(src).toContain('PLATFORM_FACTS');
    expect(src).not.toContain('compliance@feastpot.co.uk');
  });

  // Appeals email pages must also go through PLATFORM_FACTS.
  it('account-status-client: appeals email from PLATFORM_FACTS, not hardcoded', () => {
    const src = read('apps/vendor/src/app/account-status/account-status-client.tsx');
    expect(src).toContain('PLATFORM_FACTS');
    expect(src).not.toContain('appeals@feastpot.co.uk');
  });

  it('dispute-detail-client: appeals email from PLATFORM_FACTS, not hardcoded', () => {
    const src = read('apps/vendor/src/app/disputes/[id]/dispute-detail-client.tsx');
    expect(src).toContain('PLATFORM_FACTS');
    expect(src).not.toContain('appeals@feastpot.co.uk');
  });
});
