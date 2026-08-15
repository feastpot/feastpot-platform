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

import { ALLERGEN_FREE_SLUGS, DIETARY_PREFERENCE_SLUGS } from '@feastpot/config/allergens';
import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

const ROOT = join(__dirname, '../../../');

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('PLATFORM_FACTS - shape and values', () => {
  it('brandName is "Feastpot" (capital F, lowercase p)', () => {
    expect(PLATFORM_FACTS.brandName).toBe('Feastpot');
    // Ensures the wrong capitalisation never slips into the canonical constant
    expect(PLATFORM_FACTS.brandName).not.toContain('FeastPot');
  });

  it('commission rates are positive and in expected range', () => {
    expect(PLATFORM_FACTS.commission.marketplaceFirst).toBeGreaterThan(0);
    expect(PLATFORM_FACTS.commission.marketplaceFirst).toBeLessThanOrEqual(100);
    expect(PLATFORM_FACTS.commission.marketplaceRepeat).toBeLessThan(
      PLATFORM_FACTS.commission.marketplaceFirst,
    );
  });

  it('vendor requirements include the FHRS minimum', () => {
    const hasFhrs = PLATFORM_FACTS.vendorRequirements.some((r) => r.toLowerCase().includes('fhrs'));
    expect(hasFhrs).toBe(true);
  });

  it('appeal window is 14 calendar days (RED-102)', () => {
    expect(PLATFORM_FACTS.appealWindowDays).toBe(14);
  });

  it('feeChangeNoticeDays is 30 (vendor-facing commission/fee change notice)', () => {
    // Covers commission.marketplaceFirst/Repeat/vendorReferred and serviceFee.percent/capPence.
    // Does NOT cover Stripe card-processing rates (pass-through, not set by Feastpot).
    expect(PLATFORM_FACTS.feeChangeNoticeDays).toBe(30);
  });

  it('support hours are defined and non-empty', () => {
    expect(PLATFORM_FACTS.support.hours.length).toBeGreaterThan(0);
  });

  it('WhatsApp channel is null (not publicly active)', () => {
    expect(PLATFORM_FACTS.support.whatsapp).toBeNull();
  });

  it('commission.vendorReferred is 0 (zero-rate for self-referred vendors)', () => {
    // The zero-rate applies only to orders placed through the vendor's own
    // referral link within vendorLinkWindowDays. Changing this value changes
    // the promise made on become-a-vendor and in vendor-terms clause 17.
    expect(PLATFORM_FACTS.commission.vendorReferred).toBe(0);
  });

  it('serviceFee values are positive and reasonable', () => {
    // serviceFee.percent is rendered verbatim in checkout and feastpass pages.
    // serviceFee.capPence is rendered as (capPence / 100).toFixed(2) in GBP.
    expect(PLATFORM_FACTS.serviceFee.percent).toBeGreaterThan(0);
    expect(PLATFORM_FACTS.serviceFee.percent).toBeLessThanOrEqual(10);
    expect(PLATFORM_FACTS.serviceFee.capPence).toBeGreaterThan(0);
  });

  it('feastPass pricing is positive and annual costs less than 12x monthly', () => {
    // The feastpass page computes break-even from these values. If annual were
    // more expensive than monthly × 12, the displayed savings would be negative.
    expect(PLATFORM_FACTS.feastPass.monthlyPence).toBeGreaterThan(0);
    expect(PLATFORM_FACTS.feastPass.annualPence).toBeGreaterThan(0);
    expect(PLATFORM_FACTS.feastPass.annualPence).toBeLessThan(
      PLATFORM_FACTS.feastPass.monthlyPence * 12,
    );
  });

  it('payouts.frequency and payouts.day are non-empty strings', () => {
    // Both fields are rendered verbatim in help, earnings, and payouts pages.
    expect(typeof PLATFORM_FACTS.payouts.frequency).toBe('string');
    expect(PLATFORM_FACTS.payouts.frequency.length).toBeGreaterThan(0);
    expect(typeof PLATFORM_FACTS.payouts.day).toBe('string');
    expect(PLATFORM_FACTS.payouts.day.length).toBeGreaterThan(0);
  });

  it('support.email is a non-empty address containing @', () => {
    expect(PLATFORM_FACTS.support.email).toMatch(/@/);
  });

  it('support.responseTime is a non-empty string', () => {
    // Rendered verbatim in help and become-a-vendor pages.
    expect(typeof PLATFORM_FACTS.support.responseTime).toBe('string');
    expect(PLATFORM_FACTS.support.responseTime.length).toBeGreaterThan(0);
  });
});

describe('Allergen constants - drift guard', () => {
  it('ALLERGEN_FREE_SLUGS has exactly 14 entries (FSA 14 major allergens)', () => {
    expect(ALLERGEN_FREE_SLUGS).toHaveLength(14);
  });

  it('ALLERGEN_FREE_SLUGS contains the expected canonical slugs', () => {
    const slugs = new Set(ALLERGEN_FREE_SLUGS);
    // Spot-check the slugs that previously diverged from FSA canonical names
    expect(slugs.has('cereals-containing-gluten')).toBe(true);
    expect(slugs.has('nuts')).toBe(true);
    expect(slugs.has('peanuts')).toBe(true);
    expect(slugs.has('soya')).toBe(true);
    expect(slugs.has('sulphur-dioxide')).toBe(true);
    // Confirm old non-canonical slugs are gone
    expect(slugs.has('gluten')).toBe(false);
    expect(slugs.has('tree_nuts')).toBe(false);
    expect(slugs.has('soybeans')).toBe(false);
    expect(slugs.has('sulphites')).toBe(false);
  });

  it('ALLERGEN_FREE_SLUGS contains no duplicates', () => {
    expect(new Set(ALLERGEN_FREE_SLUGS).size).toBe(ALLERGEN_FREE_SLUGS.length);
  });

  it('DIETARY_PREFERENCE_SLUGS contains exactly vegan and vegetarian', () => {
    expect(DIETARY_PREFERENCE_SLUGS).toHaveLength(2);
    expect(DIETARY_PREFERENCE_SLUGS).toContain('vegan');
    expect(DIETARY_PREFERENCE_SLUGS).toContain('vegetarian');
  });

  it('DIETARY_PREFERENCE_SLUGS has no overlap with ALLERGEN_FREE_SLUGS', () => {
    const allergenSet = new Set(ALLERGEN_FREE_SLUGS);
    for (const slug of DIETARY_PREFERENCE_SLUGS) {
      expect(allergenSet.has(slug)).toBe(false);
    }
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

  it('uses PLATFORM_FACTS for the appeal window (not a hardcoded literal)', () => {
    // The source must reference the constant, not repeat the number in prose.
    expect(src).toContain('PLATFORM_FACTS.appealWindowDays');
  });

  it('uses PLATFORM_FACTS for the fee-change notice period', () => {
    expect(src).toContain('PLATFORM_FACTS.feeChangeNoticeDays');
  });

  it('uses PLATFORM_FACTS for the terms-change notice period', () => {
    expect(src).toContain('PLATFORM_FACTS.termsNoticeDays');
  });

  it('uses PLATFORM_FACTS for all three commission tiers', () => {
    expect(src).toContain('PLATFORM_FACTS.commission.marketplaceFirst');
    expect(src).toContain('PLATFORM_FACTS.commission.marketplaceRepeat');
    expect(src).toContain('PLATFORM_FACTS.commission.vendorReferred');
  });

  it('uses PLATFORM_FACTS for the appeals email', () => {
    expect(src).toContain('PLATFORM_FACTS.contact.appealsEmail');
    expect(src).not.toMatch(/"appeals@feastpot\.co\.uk"/);
  });

  it('uses PLATFORM_FACTS for the compliance email (no bare hardcoded string)', () => {
    expect(src).toContain('PLATFORM_FACTS.contact.complianceEmail');
    expect(src).not.toMatch(/"compliance@feastpot\.co\.uk"/);
  });

  it('uses PLATFORM_FACTS for vendor-link and marketplace-intro attribution windows', () => {
    expect(src).toContain('PLATFORM_FACTS.attribution.vendorLinkWindowDays');
    expect(src).toContain('PLATFORM_FACTS.attribution.marketplaceIntroWindowDays');
  });

  it('contains an attribution section (clause 17)', () => {
    expect(src).toContain('id="attribution"');
  });

  it('contains a fee-changes section (clause 18)', () => {
    expect(src).toContain('id="fee-changes"');
  });

  it('contains a non-exclusivity section (clause 19)', () => {
    expect(src).toContain('id="non-exclusivity"');
  });

  it('contains an appeals section (clause 20)', () => {
    expect(src).toContain('id="appeals"');
  });

  it('contains a P2B regulation disclosure in the ranking section', () => {
    expect(src).toContain('P2B Regulation');
  });

  it('contains a data export right heading in the your-data section', () => {
    expect(src).toContain('Data export right');
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

describe('Checkout page - service fee from PLATFORM_FACTS', () => {
  // serviceFee.percent and serviceFee.capPence are rendered in two places:
  // the checkout basket ("5% service fee, capped at £2.99") and the FeastPass
  // savings explainer. Both must reference PLATFORM_FACTS so a rate change
  // propagates without a manual find-and-replace.
  const src = read('apps/web/src/app/checkout/page.tsx');

  it('references serviceFee.percent from PLATFORM_FACTS, not a hardcoded literal', () => {
    expect(src).toContain('PLATFORM_FACTS.serviceFee.percent');
  });

  it('references serviceFee.capPence from PLATFORM_FACTS, not a hardcoded literal', () => {
    expect(src).toContain('PLATFORM_FACTS.serviceFee.capPence');
  });
});

describe('FeastPass page - pricing from PLATFORM_FACTS', () => {
  // The break-even calculator and FAQ answers use four PLATFORM_FACTS values.
  // Hardcoding any one of them causes displayed savings to drift from reality
  // the next time we change subscription pricing or the service-fee cap.
  const src = read('apps/web/src/app/feastpass/page.tsx');

  it('references feastPass.monthlyPence from PLATFORM_FACTS', () => {
    expect(src).toContain('PLATFORM_FACTS.feastPass.monthlyPence');
  });

  it('references feastPass.annualPence from PLATFORM_FACTS', () => {
    expect(src).toContain('PLATFORM_FACTS.feastPass.annualPence');
  });

  it('references serviceFee.percent from PLATFORM_FACTS', () => {
    expect(src).toContain('PLATFORM_FACTS.serviceFee.percent');
  });

  it('references serviceFee.capPence from PLATFORM_FACTS', () => {
    expect(src).toContain('PLATFORM_FACTS.serviceFee.capPence');
  });
});

describe('Help page - support contact and payouts from PLATFORM_FACTS', () => {
  // The help FAQ answers vendor questions about payout timing and support
  // availability. All five fields must reference PLATFORM_FACTS so they stay
  // in sync if we change payout day, support email, or response-time promise.
  const src = read('apps/web/src/app/help/page.tsx');

  it('references payouts.frequency from PLATFORM_FACTS', () => {
    expect(src).toContain('PLATFORM_FACTS.payouts.frequency');
  });

  it('references payouts.day from PLATFORM_FACTS', () => {
    expect(src).toContain('PLATFORM_FACTS.payouts.day');
  });

  it('references support.email from PLATFORM_FACTS, not hardcoded', () => {
    expect(src).toContain('PLATFORM_FACTS.support.email');
    expect(src).not.toContain('support@feastpot.co.uk');
  });

  it('references support.hours from PLATFORM_FACTS', () => {
    expect(src).toContain('PLATFORM_FACTS.support.hours');
  });

  it('references support.responseTime from PLATFORM_FACTS', () => {
    expect(src).toContain('PLATFORM_FACTS.support.responseTime');
  });
});

describe('Become-a-vendor page - vendor-referred rate and payouts from PLATFORM_FACTS', () => {
  // The page promises vendors a specific commission rate on their own orders and
  // a specific payout day. All three fields must come from PLATFORM_FACTS so a
  // single change propagates to every section that mentions them.
  const src = read('apps/web/src/app/become-a-vendor/page.tsx');

  it('references commission.vendorReferred from PLATFORM_FACTS', () => {
    expect(src).toContain('PLATFORM_FACTS.commission.vendorReferred');
  });

  it('references payouts.day from PLATFORM_FACTS', () => {
    expect(src).toContain('PLATFORM_FACTS.payouts.day');
  });

  it('references support.responseTime from PLATFORM_FACTS', () => {
    expect(src).toContain('PLATFORM_FACTS.support.responseTime');
  });
});

describe('PLATFORM_FACTS - foundingOffer values', () => {
  it('commissionFreeGmvPence is 200000 (matches vendors.founding_allowance_granted_pence column default)', () => {
    // The Prisma schema uses a literal 200000 as the column default because Prisma
    // does not accept a TypeScript constant as a default value. The spec asserts
    // the match so a change to either is a build failure, not a silent drift.
    expect(PLATFORM_FACTS.foundingOffer.commissionFreeGmvPence).toBe(200_000);
  });

  it('referralBonusGmvPence is 25000 (£250 per referred cook)', () => {
    expect(PLATFORM_FACTS.foundingOffer.referralBonusGmvPence).toBe(25_000);
  });

  it('maxTotalCommissionFreeGmvPence is 500000 (£5,000 hard ceiling)', () => {
    expect(PLATFORM_FACTS.foundingOffer.maxTotalCommissionFreeGmvPence).toBe(500_000);
  });

  it('referralBonusGmvPence < commissionFreeGmvPence < maxTotalCommissionFreeGmvPence (ordered correctly)', () => {
    expect(PLATFORM_FACTS.foundingOffer.referralBonusGmvPence).toBeLessThan(
      PLATFORM_FACTS.foundingOffer.commissionFreeGmvPence,
    );
    expect(PLATFORM_FACTS.foundingOffer.commissionFreeGmvPence).toBeLessThan(
      PLATFORM_FACTS.foundingOffer.maxTotalCommissionFreeGmvPence,
    );
  });

  it('CJS mirror matches TS for all three foundingOffer values', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const cjs = require('../../../packages/config/src/platform-facts.cjs.js') as {
      PLATFORM_FACTS: typeof import('@feastpot/config/platform-facts').PLATFORM_FACTS;
    };
    expect(cjs.PLATFORM_FACTS.foundingOffer.commissionFreeGmvPence).toBe(
      PLATFORM_FACTS.foundingOffer.commissionFreeGmvPence,
    );
    expect(cjs.PLATFORM_FACTS.foundingOffer.referralBonusGmvPence).toBe(
      PLATFORM_FACTS.foundingOffer.referralBonusGmvPence,
    );
    expect(cjs.PLATFORM_FACTS.foundingOffer.maxTotalCommissionFreeGmvPence).toBe(
      PLATFORM_FACTS.foundingOffer.maxTotalCommissionFreeGmvPence,
    );
  });
});

describe('Vendor payouts page - payout day from PLATFORM_FACTS', () => {
  // payouts-client.tsx renders the payout day in three different UI contexts.
  // All must reference PLATFORM_FACTS.payouts.day; hardcoding "Monday" here
  // while the constant says another day would show incorrect information.
  const src = read('apps/vendor/src/app/payouts/payouts-client.tsx');

  it('references payouts.day from PLATFORM_FACTS', () => {
    expect(src).toContain('PLATFORM_FACTS.payouts.day');
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
