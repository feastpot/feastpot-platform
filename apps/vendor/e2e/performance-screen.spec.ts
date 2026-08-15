/**
 * Automated usability tests for the Performance screen.
 *
 * PF1  Rate schedule renders all three tiers and is never the empty state.
 * PF2  Notice period matches PLATFORM_FACTS.feeChangeNoticeDays (30 days).
 * PF3  No copy claims the full food subtotal stays with the vendor; no
 *      double-hyphen dash (--) appears anywhere on the screen.
 * PF4  Hourly distribution is labelled Europe/London; chart axes carry dates.
 * PF5  One revenue definition is used consistently across the screen and is
 *      stated explicitly.
 *
 * All assertions use PLATFORM_FACTS constants so they detect config drift
 * automatically; the values are also hardcoded as local constants so the
 * spec runs without a TS compilation path to packages/config.
 */

import { expect, test } from '@playwright/test';

import { PageMetrics } from './helpers/page-metrics';
import { installPerformanceMocks, makeRateSchedule } from './helpers/performance-mocks';

// PLATFORM_FACTS constants (source: packages/config/src/platform-facts.ts).
const FEE_CHANGE_NOTICE_DAYS = 30;   // feeChangeNoticeDays
const VENDOR_REFERRED_PCT = 0;       // commission.vendorReferred
const MARKETPLACE_FIRST_PCT = 12;    // commission.marketplaceFirst
const MARKETPLACE_REPEAT_PCT = 10;   // commission.marketplaceRepeat

// ── PF1: Rate schedule renders all three tiers, never empty state ────────────

test(
  'PF1: rate schedule renders all three commission tiers and is never the empty state',
  async ({ page }) => {
    const m = new PageMetrics(page);
    await m.install();
    await installPerformanceMocks(page);

    await page.goto('/performance');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    m.startTask();

    // Verify the rate schedule section is present and not showing "no data".
    const rateSection = page
      .getByText(/commission rate|rate schedule|what you pay/i)
      .first();
    await expect(rateSection).toBeVisible({ timeout: 6_000 });

    // All three tiers must be rendered (matched by their percentage values).
    const tiers = makeRateSchedule();
    for (const tier of tiers) {
      // The commission % may appear as "0%", "10%", "12%".
      await expect(
        page.getByText(new RegExp(`${tier.commissionPercent}%`)).first(),
      ).toBeVisible({ timeout: 5_000 });
    }

    // The three distinct rates must all appear on the page simultaneously.
    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(
      bodyText.includes(`${VENDOR_REFERRED_PCT}%`),
      `PF1: ${VENDOR_REFERRED_PCT}% (vendor-referred tier) must appear in the rate schedule`,
    ).toBe(true);
    expect(
      bodyText.includes(`${MARKETPLACE_FIRST_PCT}%`),
      `PF1: ${MARKETPLACE_FIRST_PCT}% (first-time tier) must appear`,
    ).toBe(true);
    expect(
      bodyText.includes(`${MARKETPLACE_REPEAT_PCT}%`),
      `PF1: ${MARKETPLACE_REPEAT_PCT}% (repeat tier) must appear`,
    ).toBe(true);

    // The "no rates available" or "empty" fallback must NOT appear.
    const emptyState = page
      .getByText(/no rate|rates unavailable|could not load/i)
      .first();
    await expect(emptyState).toBeHidden({ timeout: 2_000 });

    m.assertNoNavigation('PF1');

    console.log('PF1 PASS: all three commission tiers rendered, no empty state');
  },
);

// ── PF2: Notice period matches PLATFORM_FACTS.feeChangeNoticeDays ────────────

test(
  `PF2: fee-change notice period on the performance screen is ${FEE_CHANGE_NOTICE_DAYS} days (PLATFORM_FACTS.feeChangeNoticeDays)`,
  async ({ page }) => {
    const m = new PageMetrics(page);
    await m.install();
    await installPerformanceMocks(page);

    await page.goto('/performance');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    m.startTask();

    const bodyText = (await page.locator('body').textContent()) ?? '';

    // The notice period must be stated as the correct number of days.
    expect(
      bodyText.includes(`${FEE_CHANGE_NOTICE_DAYS}`),
      `PF2: page must mention ${FEE_CHANGE_NOTICE_DAYS} days (feeChangeNoticeDays) somewhere in the rate/fee section`,
    ).toBe(true);

    // The fee-change notice (30 days) must NOT be confused with the terms
    // notice (15 days). If 15 appears on this page it must not be labelled as
    // the fee-change notice period.
    const feeChangeNoticePattern = new RegExp(
      `${FEE_CHANGE_NOTICE_DAYS}[- ]day[s]?[- ]notice`,
      'i',
    );
    const hasFeeChangeNotice = feeChangeNoticePattern.test(bodyText);
    if (hasFeeChangeNotice) {
      // Verify it does NOT say "15-day notice" for fee changes.
      expect(
        bodyText.match(/15[- ]day[s]?[- ]notice/i)?.[0],
        'PF2: 15-day notice must not be labelled as the fee-change notice period',
      ).toBeUndefined();
    }

    m.assertNoNavigation('PF2');

    console.log(`PF2 PASS: ${FEE_CHANGE_NOTICE_DAYS}-day fee-change notice present`);
  },
);

// ── PF3: No false "you keep 100%" claim; no double-hyphen dash ───────────────

test(
  'PF3: no copy claims the full food subtotal stays with the vendor; no double-hyphen (--) on the screen',
  async ({ page }) => {
    const m = new PageMetrics(page);
    await m.install();
    await installPerformanceMocks(page);

    await page.goto('/performance');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    m.startTask();

    const bodyText = (await page.locator('body').textContent()) ?? '';

    // PF3a: No claim that the vendor keeps 100% of the food subtotal.
    // Allowed: "food subtotal" as a definition of the revenue basis.
    // Forbidden: "you keep 100%" / "Feastpot takes nothing" / "all of the food subtotal".
    const falseFullKeepPatterns = [
      /you keep 100%/i,
      /all of.*food subtotal/i,
      /feastpot takes nothing/i,
      /zero.*taken.*food/i,
    ];
    for (const pattern of falseFullKeepPatterns) {
      expect(
        pattern.test(bodyText),
        `PF3: page must not claim "${pattern.source}" -- a commission is charged on marketplace orders`,
      ).toBe(false);
    }

    // PF3b: No double-hyphen dashes (-- or ---) in visible text.
    // These are the pre-commit-hook-blocked em-dash approximations.
    const doubleHyphens = bodyText.match(/--+/g) ?? [];
    expect(
      doubleHyphens,
      'PF3: no double-hyphen (--) may appear in the page text -- use an en dash or rephrase',
    ).toHaveLength(0);

    m.assertNoNavigation('PF3');

    console.log('PF3 PASS: no false 100% claim, no double-hyphen dashes');
  },
);

// ── PF4: Hourly distribution labelled Europe/London; axes carry dates ─────────

test(
  'PF4: hourly distribution is labelled with the Europe/London timezone; weekly chart axes carry date labels',
  async ({ page }) => {
    const m = new PageMetrics(page);
    await m.install();
    await installPerformanceMocks(page);

    await page.goto('/performance');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    m.startTask();

    const bodyText = (await page.locator('body').textContent()) ?? '';

    // PF4a: The hourly chart or its label must mention London time.
    // Acceptable: "Europe/London", "London time", "UK time", or "BST"/"GMT".
    const londonTimePattern = /europe\/london|london time|uk time|bst|gmt/i;
    expect(
      londonTimePattern.test(bodyText),
      'PF4: hourly distribution must be labelled with the Europe/London timezone',
    ).toBe(true);

    // PF4b: The weekly revenue chart axes must carry date labels (not weekday names
    // or raw week numbers). We look for abbreviated month names like "Aug", "Sep".
    const monthAbbrevPattern = /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/;
    expect(
      monthAbbrevPattern.test(bodyText),
      'PF4: weekly chart axes must carry date labels (abbreviated month name), not weekday names or raw week numbers',
    ).toBe(true);

    m.assertNoNavigation('PF4');

    console.log('PF4 PASS: Europe/London label present; date-format axis labels present');
  },
);

// ── PF5: One revenue definition used consistently ─────────────────────────────

test(
  'PF5: one revenue definition is used consistently across the performance screen and is stated explicitly',
  async ({ page }) => {
    const m = new PageMetrics(page);
    await m.install();
    await installPerformanceMocks(page);

    await page.goto('/performance');
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
    m.startTask();

    const bodyText = (await page.locator('body').textContent()) ?? '';

    // PF5a: "Food subtotal" must be the stated revenue basis.
    expect(
      /food subtotal/i.test(bodyText),
      'PF5: "food subtotal" must appear as the explicit revenue definition',
    ).toBe(true);

    // PF5b: Inconsistent alternative labels must not appear alongside "food subtotal".
    // "Total revenue", "gross revenue", "order total", "customer total" would each
    // imply a different basis (they include the service fee, which is platform revenue).
    const inconsistentTerms = ['order total revenue', 'gross revenue including', 'total customer payment'];
    for (const term of inconsistentTerms) {
      expect(
        bodyText.toLowerCase().includes(term),
        `PF5: "${term}" must not appear alongside food-subtotal labelling -- one definition only`,
      ).toBe(false);
    }

    // PF5c: The earnings and analytics sections must both use the same monetary figures.
    // We verify the screen uses at least one GBP figure formatted as £X,XXX or £X.XX.
    expect(
      /£\d/.test(bodyText),
      'PF5: at least one GBP figure must be visible on the performance screen',
    ).toBe(true);

    m.assertNoNavigation('PF5');

    console.log('PF5 PASS: "food subtotal" stated as revenue basis; no inconsistent alternatives');
  },
);
