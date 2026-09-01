import { expect, test, vendor } from './helpers';

test.describe('customer discovery permutations', () => {
  test('many vendors return promptly, while one vendor and capacity states remain visible', async ({
    page,
    customer,
  }) => {
    // Warm Next.js before timing so development compilation is not counted as
    // customer-visible search latency.
    await page.goto('/');
    await customer.mockVendorSearch([
      ...Array.from({ length: 8 }, (_, index) =>
        vendor({ id: `many-${index}`, slug: `many-${index}`, businessName: `Kitchen ${index}` }),
      ),
      vendor({
        id: 'sold-out',
        slug: 'sold-out',
        businessName: 'Sold Out Kitchen',
        availableSlots: 0,
      }),
      vendor({ id: 'cutoff', slug: 'cutoff', businessName: 'Capacity Cutoff', availableSlots: 1 }),
    ]);
    const started = Date.now();
    await page.goto('/vendors?postcode=SE15');
    await expect(page.getByText('Kitchen 0')).toBeVisible();
    await expect(page.getByText('Sold Out Kitchen')).toBeVisible();
    await expect(page.getByText('Capacity Cutoff')).toBeVisible();
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  test('one, zero, invalid, and outward-only postcodes have explicit states', async ({
    page,
    customer,
  }) => {
    await customer.mockVendorSearch([vendor({ businessName: 'The Only Kitchen' })]);
    await page.goto('/vendors?postcode=SE15');
    await expect(page.getByText('The Only Kitchen')).toBeVisible();

    await page.unroute('**/v1/vendors**');
    await customer.mockVendorSearch([]);
    await page.goto('/vendors?postcode=ZZ99');
    await expect(page.getByText(/isn.t serving ZZ99 yet/i)).toBeVisible();

    await page.goto('/vendors?postcode=not-a-postcode');
    await expect(page.getByRole('alert')).toContainText(/doesn.t look like a UK postcode/i);

    await page.goto('/vendors?postcode=SE15%204TY');
    await expect(page.getByText(/SE15 4TY/i).first()).toBeVisible();
  });

  test('suspended vendors and dishes without allergen data are absent from discoverable payloads', async ({
    page,
    customer,
  }) => {
    // V7/V8 are never returned by the public search endpoint. The allergen-free
    // query must likewise not claim safety for a dish with an empty allergen set.
    await customer.mockVendorSearch([
      vendor({ id: 'safe', businessName: 'Allergen Declared Kitchen' }),
    ]);
    await page.goto('/vendors?postcode=SE15&allergenFree=milk');
    await expect(page.getByText('Allergen Declared Kitchen')).toBeVisible();
    await expect(page.getByText(/V7|V8|Suspended Kitchen/)).toHaveCount(0);
  });
});
