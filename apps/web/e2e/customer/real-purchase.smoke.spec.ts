import { assertCustomerSmokeEnvironment, expect, test } from './helpers';

test.describe('real Stripe test-mode customer purchase', () => {
  // A retry must never create another Stripe PaymentIntent or order. Fail once
  // and surface the isolated-environment problem instead.
  test.describe.configure({ retries: 0 });

  test('CP-1: completes one test-mode purchase without duplicate order or payment', async ({
    page,
  }) => {
    assertCustomerSmokeEnvironment();
    const email = process.env.TEST_CUSTOMER_EMAIL!;
    const password = process.env.TEST_CUSTOMER_PASSWORD!;
    const addressId = process.env.TEST_CUSTOMER_ADDRESS_ID!;
    let orderCreates = 0;
    let accessToken: string | null = null;
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/v1\/orders(?:\?|$)/.test(request.url())) {
        orderCreates += 1;
        accessToken = request.headers().authorization?.replace(/^Bearer\s+/i, '') ?? null;
      }
    });

    await page.goto('/sign-in?next=/checkout');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/checkout|vendors/, { timeout: 20_000 });

    // Basket seeding uses the real client store, not a test endpoint. The
    // checkout creates and confirms a real Stripe PaymentIntent with 4242.
    await page.evaluate(
      ({ menuItemId, vendorSlug, vendorId }) => {
        localStorage.setItem(
          'feastpot.basket.v1',
          JSON.stringify({
            state: {
              vendor: { id: vendorId, name: vendorSlug, slug: vendorSlug },
              items: [
                {
                  lineId: 'customer-e2e',
                  menuItemId,
                  menuItemName: 'Customer E2E item',
                  quantity: 1,
                  unitPricePence: 1000,
                  lineTotalPence: 1000,
                },
              ],
            },
            version: 0,
          }),
        );
      },
      {
        menuItemId: process.env.TEST_CUSTOMER_MENU_ITEM_ID!,
        vendorSlug: process.env.TEST_CUSTOMER_VENDOR_SLUG!,
        vendorId: process.env.TEST_CUSTOMER_VENDOR_ID!,
      },
    );
    await page.goto('/checkout');
    await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible();
    await page.locator(`input[name="address"][value="${addressId}"]`).check();
    const slotSection = page.locator('section').filter({ hasText: 'When do you need the food?' });
    await slotSection
      .getByRole('button', { name: /^Select \d{1,2} \w+$/ })
      .first()
      .click();
    await slotSection
      .getByRole('button', { name: /^Select \d{2}:00/ })
      .first()
      .click();
    await page.getByRole('checkbox').check();
    const cardFrame = page.frameLocator('iframe[name^="__privateStripeFrame"]');
    await cardFrame.locator('input[name="cardnumber"]').fill('4242424242424242');
    await cardFrame.locator('input[name="exp-date"]').fill('1230');
    await cardFrame.locator('input[name="cvc"]').fill('123');
    const orderResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && /\/v1\/orders(?:\?|$)/.test(response.url()),
    );
    await page.getByRole('button', { name: 'Place order securely' }).first().click();
    const orderResponse = await orderResponsePromise;
    expect(orderResponse.ok()).toBeTruthy();
    await expect(page).toHaveURL(/\/orders\/[^/]+\/confirmation$/, { timeout: 30_000 });
    await expect(page.getByText(/order confirmed|thanks/i)).toBeVisible();
    expect(orderCreates).toBe(1);

    const orderId = page.url().match(/\/orders\/([^/]+)\/confirmation$/)?.[1];
    expect(orderId).toBeTruthy();
    expect(accessToken).toBeTruthy();
    const result = await page.request.get(
      `${process.env.NEXT_PUBLIC_API_URL}/v1/orders/${orderId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    expect(result.ok()).toBeTruthy();
    const persisted = (await result.json()) as {
      id: string;
      status: string;
      subtotalPence: number;
      deliveryFeePence: number;
      serviceFeePence: number;
      discountPence: number;
      totalPence: number;
    };
    expect(persisted.id).toBe(orderId);
    expect(['pending', 'accepted']).toContain(persisted.status);
    expect(persisted.subtotalPence).toBeGreaterThan(0);
    expect(persisted.totalPence).toBe(
      persisted.subtotalPence +
        persisted.deliveryFeePence +
        persisted.serviceFeePence -
        persisted.discountPence,
    );
  });
});
