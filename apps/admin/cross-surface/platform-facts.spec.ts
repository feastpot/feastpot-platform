import { expect, test } from '@playwright/test';

import {
  assertPlatformFactsAgree,
  type PlatformFactSource,
  type SourceFacts,
} from './platform-facts-comparator';

const surfaces: ReadonlyArray<[PlatformFactSource, string]> = [
  ['customer site', process.env.PART_A_WEB_URL ?? 'http://127.0.0.1:3000'],
  ['vendor portal', process.env.PART_A_VENDOR_URL ?? 'http://127.0.0.1:3002'],
  ['admin console', process.env.PART_A_ADMIN_URL ?? 'http://127.0.0.1:3003'],
];
const apiUrl = process.env.PART_A_API_URL ?? 'http://127.0.0.1:3001';

test('A1: all nine facts agree across the four rendered HTTP surfaces', async ({
  browser,
  request,
}) => {
  const observed = {} as SourceFacts;

  for (const [name, baseUrl] of surfaces) {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/platform-facts`);
    const visible = page.getByTestId('platform-facts-visible');
    await expect(visible).toBeVisible();
    await expect(visible.locator('section')).toHaveCount(9);
    const rawModel = await page.locator('#platform-facts-model').textContent();
    expect(rawModel, `${name} did not render its platform facts model`).toBeTruthy();
    observed[name] = JSON.parse(rawModel!);

    const model = observed[name] as {
      currentVendorTermsVersion: string;
      allergens: string[];
      vendorEligibilityRequirements: string[];
      commissionRates: {
        marketplaceFirst: number;
        marketplaceRepeat: number;
        vendorReferred: number;
        catering: number;
        basis: string;
      };
      customerServiceFee: { percent: number; capPence: number };
      feastPassPricing: { monthlyPence: number; annualPence: number };
      cateringPolicy: {
        depositPercent: number;
        cancellationTiers: Array<{ minimumDaysBeforeEvent: number; refundPercent: number }>;
      };
      payoutSchedule: { frequency: string; day: string };
      support: {
        hours: string;
        email: string;
        complianceEmail: string;
        appealsEmail: string;
      };
    };
    const visibleValues = [
      `${model.commissionRates.marketplaceFirst}%`,
      `${model.commissionRates.marketplaceRepeat}%`,
      `${model.commissionRates.vendorReferred}%`,
      `${model.commissionRates.catering}%`,
      model.commissionRates.basis,
      `${model.customerServiceFee.percent}%`,
      `£${(model.customerServiceFee.capPence / 100).toFixed(2)}`,
      `£${(model.feastPassPricing.monthlyPence / 100).toFixed(2)}`,
      `£${(model.feastPassPricing.annualPence / 100).toFixed(2)}`,
      `${model.cateringPolicy.depositPercent}%`,
      model.payoutSchedule.frequency,
      model.payoutSchedule.day,
      model.currentVendorTermsVersion,
      model.support.hours,
      model.support.email,
      model.support.complianceEmail,
      model.support.appealsEmail,
      ...model.allergens,
      ...model.vendorEligibilityRequirements,
      ...model.cateringPolicy.cancellationTiers.flatMap((tier) => [
        String(tier.minimumDaysBeforeEvent),
        `${tier.refundPercent}%`,
      ]),
    ];
    for (const value of visibleValues) {
      await expect(visible, `${name} did not visibly render "${value}"`).toContainText(value);
    }
    await page.close();
  }

  const apiResponse = await request.get(`${apiUrl}/v1/platform-facts`);
  expect(apiResponse.ok(), `API returned ${apiResponse.status()}`).toBeTruthy();
  observed.API = await apiResponse.json();
  expect(Object.keys(observed.API as object)).toHaveLength(9);
  expect(() => assertPlatformFactsAgree(observed)).not.toThrow();
});

test('A2: an intercepted rendered HTTP drift names both disagreeing surfaces', async ({
  browser,
  request,
}) => {
  const observed = {} as SourceFacts;
  for (const [name, baseUrl] of surfaces.slice(0, 2)) {
    const page = await browser.newPage();
    await page.goto(`${baseUrl}/platform-facts`);
    observed[name] = JSON.parse((await page.locator('#platform-facts-model').textContent())!);
    await page.close();
  }

  const apiResponse = await request.get(`${apiUrl}/v1/platform-facts`);
  observed.API = await apiResponse.json();

  const adminPage = await browser.newPage();
  await adminPage.route('**/platform-facts', async (route) => {
    const original = await route.fetch();
    const originalBody = await original.text();
    const expected = (
      observed['customer site'] as { commissionRates: { marketplaceFirst: number } }
    ).commissionRates.marketplaceFirst;
    const rewritten = originalBody
      .replace(`"marketplaceFirst":${expected}`, '"marketplaceFirst":-1')
      .replace(new RegExp(`(Marketplace first order[\\s\\S]{0,200}?<dd[^>]*>)${expected}`), '$1-1');
    await route.fulfill({ response: original, body: rewritten });
  });
  await adminPage.goto(`${surfaces[2]![1]}/platform-facts`);
  await expect(adminPage.getByTestId('platform-facts-visible')).toContainText('-1%');
  observed['admin console'] = JSON.parse(
    (await adminPage.locator('#platform-facts-model').textContent())!,
  );
  await adminPage.close();

  expect(() => assertPlatformFactsAgree(observed)).toThrow(
    'Platform facts disagree: customer site and admin console.',
  );
});

test('A3: a pure nested comparator mismatch names both sources', () => {
  const common = { customerServiceFee: { percent: 5, capPence: 299 } };
  const sources: SourceFacts = {
    'customer site': common,
    'vendor portal': common,
    'admin console': common,
    API: { customerServiceFee: { percent: 6, capPence: 299 } },
  };

  expect(() => assertPlatformFactsAgree(sources)).toThrow(
    'Platform facts disagree: customer site and API.',
  );
});
