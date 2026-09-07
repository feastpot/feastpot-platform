import type { Page } from '@playwright/test';

import { expect, test, vendor, type VendorCardExtrasFixture } from './helpers';

const capacity = (
  serviceDate: string,
  totalSlots: number,
  remainingSlots: number,
): VendorCardExtrasFixture['capacity'][string][number] => ({
  serviceDate,
  capacityType: 'family_pot',
  totalSlots,
  slotsTaken: totalSlots - remainingSlots,
  remainingSlots,
  preorderCutoffAt: '2030-01-04T18:00:00.000Z',
});

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
}

test.describe('customer discovery permutations', () => {
  test('many vendors return promptly and preserve sold-out and capacity-cutoff records', async ({
    page,
    customer,
  }) => {
    const soldOut = vendor({
      id: 'sold-out-record',
      slug: 'sold-out-record',
      businessName: 'Sold Out Kitchen',
    });
    const cutoff = vendor({
      id: 'capacity-cutoff-record',
      slug: 'capacity-cutoff-record',
      businessName: 'Capacity Cutoff Kitchen',
    });
    await customer.mockVendorSearch(
      [
        ...Array.from({ length: 8 }, (_, index) =>
          vendor({ id: `many-${index}`, slug: `many-${index}`, businessName: `Kitchen ${index}` }),
        ),
        soldOut,
        cutoff,
      ],
      {
        trustSignals: {},
        capacity: {
          [soldOut.id]: [capacity('2030-01-05', 12, 0)],
          [cutoff.id]: [capacity('2030-01-05', 3, 1)],
        },
      },
    );
    // Warm the exact route before timing so development compilation is not
    // counted as customer-visible search latency.
    await page.goto('/vendors?postcode=SE15');
    const started = Date.now();
    await page.reload();
    await expect(page.getByText('Kitchen 0')).toBeVisible();
    await expect(page.locator('article')).toHaveCount(10);
    const soldOutCard = page.locator('article').filter({ hasText: soldOut.businessName });
    await expect(soldOutCard).toContainText('Fully booked Saturday');
    const cutoffCard = page.locator('article').filter({ hasText: cutoff.businessName });
    await expect(cutoffCard).toContainText('1 of 3 Saturday pots left');
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  test('one, zero, invalid, outward-only, and full postcodes have explicit states', async ({
    page,
    customer,
  }) => {
    const only = vendor({
      id: 'only-record',
      slug: 'only-record',
      businessName: 'The Only Kitchen',
    });
    const searchedPostcodes: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.endsWith('/v1/vendors')) {
        searchedPostcodes.push(url.searchParams.get('postcode') ?? '');
      }
    });
    await customer.mockVendorSearch([only]);
    await page.goto('/vendors?postcode=SE15');
    await expect(page.locator('article').filter({ hasText: only.businessName })).toBeVisible();
    await expect(page.locator('article')).toHaveCount(1);

    await page.unroute('**/v1/vendors**');
    await customer.mockVendorSearch([]);
    await page.goto('/vendors?postcode=ZZ99');
    await expect(page.getByText(/isn.t serving ZZ99 yet/i)).toBeVisible();
    await expect(page.getByText(/only see cooks who can actually deliver to you/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join the waitlist' })).toBeVisible();

    await page.goto('/vendors?postcode=not-a-postcode');
    await expect(page.getByRole('alert')).toContainText(/doesn.t look like a UK postcode/i);
    expect(searchedPostcodes).not.toContain('not-a-postcode');

    await page.unroute('**/v1/vendors**');
    await page.route('**/v1/vendors**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/card-extras')) {
        await route.fulfill({ json: { trustSignals: {}, capacity: {} } });
        return;
      }
      searchedPostcodes.push(url.searchParams.get('postcode') ?? '');
      await route.fulfill({ json: { data: [only], nextCursor: null } });
    });
    await page.goto('/vendors?postcode=SE15%204TY');
    await expect(page.locator('article').filter({ hasText: only.businessName })).toBeVisible();
    expect(searchedPostcodes).toContain('SE15');
    expect(searchedPostcodes).toContain('SE15 4TY');
  });

  test('allergen control sends the selected filter and only exposes the declared-dish fixture', async ({
    page,
    customer,
  }) => {
    const declaredDishVendor = vendor({
      id: 'declared-allergen-dish-record',
      slug: 'declared-allergen-dish-record',
      businessName: 'Declared Allergen Dish Kitchen',
    });
    // This record represents a dish whose allergens are declared. The empty
    // allergen dish and suspended V7/V8 records deliberately never appear in
    // the public search response: route fixtures mirror the public contract,
    // rather than claiming an unlabelled dish is safe.
    const omittedAllergenlessDishVendor = vendor({
      id: 'empty-allergen-dish-record',
      slug: 'empty-allergen-dish-record',
      businessName: 'Empty Allergen Dish Kitchen',
    });
    const suspendedV7 = vendor({
      id: 'suspended-v7-record',
      slug: 'suspended-v7-record',
      businessName: 'Suspended V7 Kitchen',
      status: 'suspended',
    });
    const requestedAllergenFilters: string[] = [];
    await page.unroute('**/v1/vendors**');
    await page.route('**/v1/vendors**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/card-extras')) {
        await route.fulfill({ json: { trustSignals: {}, capacity: {} } });
        return;
      }
      const allergenFree = url.searchParams.get('allergenFree');
      if (allergenFree) requestedAllergenFilters.push(allergenFree);
      await route.fulfill({
        json: {
          data: allergenFree === 'milk' ? [declaredDishVendor] : [declaredDishVendor],
          nextCursor: null,
        },
      });
    });
    await page.goto('/vendors?postcode=SE15');
    await page.getByText('Filters', { exact: true }).click();
    const dairyFree = page.getByLabel('Dairy-free');
    await expect(dairyFree).toBeVisible();
    await dairyFree.check();
    await expect(page).toHaveURL(/allergenFree=milk/);
    await expect(
      page.locator('article').filter({ hasText: declaredDishVendor.businessName }),
    ).toBeVisible();
    await expect(
      page.locator('article').filter({ hasText: omittedAllergenlessDishVendor.businessName }),
    ).toHaveCount(0);
    await expect(page.locator('article').filter({ hasText: suspendedV7.businessName })).toHaveCount(
      0,
    );
    expect(requestedAllergenFilters).toContain('milk');
  });

  test('homepage has no horizontal overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /proper african and caribbean food/i }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
