import type { Page } from '@playwright/test';

import type { CheckoutScenarioFixture, TestDataFactory } from '../../../../scripts/test-factory';

import {
  assertCustomerSmokeEnvironment,
  CustomerFixture,
  expectFactoryPaymentAuthorised,
  expect,
  inspectFactoryPaymentState,
  test,
  type InspectedPaymentState,
} from './helpers';

const cards: Record<
  'success' | 'declined' | 'insufficient funds' | '3DS completed' | '3DS abandoned',
  string
> = {
  success: '4242424242424242',
  declined: '4000000000000002',
  'insufficient funds': '4000000000009995',
  '3DS completed': '4000002500003155',
  '3DS abandoned': '4000002760003184',
};

async function openReadyCheckout(page: Page, fixture: CheckoutScenarioFixture): Promise<void> {
  await page.goto('/sign-in?next=/vendors');
  await page.locator('#signin-email').fill(fixture.customer.credentials.email);
  await page.locator('#signin-password').fill(fixture.customer.credentials.password!);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/vendors');

  await page.addInitScript(
    (value) => {
      localStorage.setItem(
        'feastpot.basket.v1',
        JSON.stringify({
          state: {
            vendor: { id: value.vendorId, name: value.slug, slug: value.slug },
            items: [
              {
                lineId: 'payment-state',
                menuItemId: value.menuItemId,
                menuItemName: 'Payment state dish',
                quantity: 1,
                unitPricePence: value.pricePence,
                lineTotalPence: value.pricePence,
              },
            ],
          },
          version: 0,
        }),
      );
      localStorage.setItem(`fp_mp_${value.vendorId}`, String(Date.now()));
    },
    {
      vendorId: fixture.vendor.vendorId!,
      slug: fixture.vendor.vendorSlug!,
      menuItemId: fixture.vendor.menuItemId!,
      pricePence: fixture.vendor.menuItemPricePence!,
    },
  );

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
  await page.locator(`input[name="address"][value="${fixture.customer.addressId!}"]`).check();
  const slots = page.locator('section').filter({ hasText: 'When do you need the food?' });
  await slots
    .getByRole('button', { name: /^Select \d{1,2} \w+$/ })
    .last()
    .click();
  await slots
    .getByRole('button', { name: /^Select \d{2}:00/ })
    .first()
    .click();
  await page.getByRole('checkbox').check();
}

async function enterCard(page: Page, number: string): Promise<void> {
  const card = page.frameLocator(
    'iframe[name^="__privateStripeFrame"][title="Secure card payment input frame" i]',
  );
  await expect(card.locator('input[name="exp-date"]')).toBeVisible({ timeout: 30_000 });
  await card.locator('input[name="cardnumber"]').fill(number);
  await card.locator('input[name="exp-date"]').fill('1230');
  await card.locator('input[name="cvc"]').fill('123');
  await card.locator('input[autocomplete="postal-code"]').fill('90210');
}

async function submit(page: Page): Promise<void> {
  const response = page.waitForResponse(
    (result) =>
      result.request().method() === 'POST' && new URL(result.url()).pathname === '/v1/orders',
  );
  await page.getByRole('button', { name: 'Place order securely' }).first().click();
  const orderResponse = await response;
  if (!orderResponse.ok()) {
    const body = await orderResponse.json();
    throw new Error(
      `CUSTOMER_ORDER_CREATION_FAILED: ${orderResponse.status()} ${body.code ?? body.error?.code ?? 'UNKNOWN'} ${body.ref ?? body.errorRef ?? ''}`,
    );
  }
}

async function completeThreeDs(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          const button = frame
            .locator('#test-source-authorize-3ds')
            .or(frame.getByRole('button', { name: /complete|authenticate|success/i }))
            .first();
          if (await button.isVisible().catch(() => false)) return true;
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  for (const frame of page.frames()) {
    const button = frame
      .locator('#test-source-authorize-3ds')
      .or(frame.getByRole('button', { name: /complete|authenticate|success/i }))
      .first();
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return;
    }
  }
  throw new Error('CUSTOMER_E2E_3DS_CHALLENGE_NOT_FOUND');
}

function expectNoOrphans(
  state: InspectedPaymentState,
  expected: { orders: number; orderStatuses: string[]; paymentStatuses: string[] },
): void {
  expect(state.orders).toHaveLength(expected.orders);
  expect(state.orders.every((order) => expected.orderStatuses.includes(order.status))).toBe(true);
  const payments = state.orders.flatMap((order) => order.payments);
  expect(payments).toHaveLength(expected.orders);
  expect(payments.every((payment) => expected.paymentStatuses.includes(payment.status))).toBe(true);
  for (const order of state.orders) expect(order.payments).toHaveLength(1);
}

async function abandonThreeDs(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          const button = frame
            .locator('#test-source-fail-3ds')
            .or(frame.getByRole('button', { name: /fail|cancel|decline/i }))
            .first();
          if (await button.isVisible().catch(() => false)) return true;
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  for (const frame of page.frames()) {
    const button = frame
      .locator('#test-source-fail-3ds')
      .or(frame.getByRole('button', { name: /fail|cancel|decline/i }))
      .first();
    if (await button.isVisible().catch(() => false)) {
      await button.click();
      return;
    }
  }
  throw new Error('CUSTOMER_E2E_3DS_CHALLENGE_NOT_FOUND');
}

async function withScenario(
  request: Parameters<typeof inspectFactoryPaymentState>[0],
  customer: CustomerFixture,
  run: (input: {
    factory: TestDataFactory;
    fixture: CheckoutScenarioFixture;
    accessToken: string;
  }) => Promise<void>,
): Promise<void> {
  assertCustomerSmokeEnvironment();
  const { factory, fixture } = await customer.provisionCheckoutScenario(
    'MARKETPLACE_NEW_NON_MEMBER',
  );
  try {
    // Inspect with a token issued independently of the browser so closing the
    // checkout tab cannot remove the authority used by the assertion seam.
    const accessToken = await factory.issueAccessToken(fixture.customer);
    await run({ factory, fixture, accessToken });
  } finally {
    await factory.teardown(fixture.customer);
    await factory.teardown(fixture.vendor);
    await factory.dispose();
  }
}

test.describe('customer payment outcomes', () => {
  test.describe.configure({ timeout: 120_000 });
  test.describe.configure({ mode: 'default', retries: 0 });

  test('success', async ({ page, request, customer }) => {
    await withScenario(request, customer, async ({ factory, fixture, accessToken }) => {
      await openReadyCheckout(page, fixture);
      await enterCard(page, cards.success);
      await submit(page);
      await expect(page).toHaveURL(/\/orders\/[^/]+\/confirmation$/, { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'Order placed!', exact: true })).toBeVisible();
      const state = await inspectFactoryPaymentState(request, accessToken);
      expectNoOrphans(state, {
        orders: 1,
        orderStatuses: ['pending', 'accepted'],
        paymentStatuses: ['pending'],
      });
      await expectFactoryPaymentAuthorised(factory, state);
    });
  });

  for (const outcome of ['declined', 'insufficient funds'] as const) {
    test(outcome, async ({ page, request, customer }) => {
      await withScenario(request, customer, async ({ fixture, accessToken }) => {
        await openReadyCheckout(page, fixture);
        await enterCard(page, cards[outcome]);
        await submit(page);
        await expect(page.locator('main').getByRole('alert')).toBeVisible({ timeout: 30_000 });
        expectNoOrphans(await inspectFactoryPaymentState(request, accessToken), {
          orders: 1,
          orderStatuses: ['cancelled'],
          paymentStatuses: ['cancelled'],
        });
      });
    });
  }

  test('3DS completed', async ({ page, request, customer }) => {
    await withScenario(request, customer, async ({ factory, fixture, accessToken }) => {
      await openReadyCheckout(page, fixture);
      await enterCard(page, cards['3DS completed']);
      await submit(page);
      await completeThreeDs(page);
      await expect(page).toHaveURL(/\/orders\/[^/]+\/confirmation$/, { timeout: 30_000 });
      const state = await inspectFactoryPaymentState(request, accessToken);
      expectNoOrphans(state, {
        orders: 1,
        orderStatuses: ['pending', 'accepted'],
        paymentStatuses: ['pending'],
      });
      await expectFactoryPaymentAuthorised(factory, state);
    });
  });

  test('3DS abandoned', async ({ page, request, customer }) => {
    await withScenario(request, customer, async ({ fixture, accessToken }) => {
      await openReadyCheckout(page, fixture);
      await enterCard(page, cards['3DS abandoned']);
      await submit(page);
      // Test-mode Stripe exposes a failed challenge action; using it models a
      // customer abandoning authentication while retaining the normal browser
      // cancellation compensation path.
      await abandonThreeDs(page);
      await expect(page.locator('main').getByRole('alert')).toBeVisible({ timeout: 30_000 });
      expectNoOrphans(await inspectFactoryPaymentState(request, accessToken), {
        orders: 1,
        orderStatuses: ['cancelled'],
        paymentStatuses: ['cancelled'],
      });
    });
  });

  test('confirmation network timeout', async ({ page, request, customer }) => {
    await withScenario(request, customer, async ({ fixture, accessToken }) => {
      await openReadyCheckout(page, fixture);
      await enterCard(page, cards.success);
      await page.route('**/v1/orders/*/confirm', (route) => route.abort('timedout'));
      await submit(page);
      await expect(page.getByText('Your payment was authorised.')).toBeVisible({ timeout: 30_000 });
      expectNoOrphans(await inspectFactoryPaymentState(request, accessToken), {
        orders: 1,
        orderStatuses: ['pending'],
        paymentStatuses: ['pending'],
      });
    });
  });

  test('duplicate submit', async ({ page, request, customer }) => {
    await withScenario(request, customer, async ({ fixture, accessToken }) => {
      await openReadyCheckout(page, fixture);
      await enterCard(page, cards.declined);
      const created = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).pathname === '/v1/orders',
      );
      // Dispatch both submissions in the same browser turn. Two Playwright
      // clicks wait for a disabled button to re-enable, testing a later retry
      // instead of simultaneous submissions.
      await page
        .getByRole('button', { name: 'Place order securely' })
        .first()
        .evaluate((button) => {
          const form = button.closest('form');
          if (!form) throw new Error('CHECKOUT_FORM_REQUIRED');
          form.requestSubmit();
          form.requestSubmit();
        });
      expect((await created).ok()).toBe(true);
      await expect(page.locator('main').getByRole('alert')).toBeVisible({ timeout: 30_000 });
      const state = await inspectFactoryPaymentState(request, accessToken);
      expect(state.orders.length).toBeLessThanOrEqual(1);
      expectNoOrphans(state, {
        orders: 1,
        orderStatuses: ['cancelled'],
        paymentStatuses: ['cancelled'],
      });
    });
  });

  test('tab closed mid-payment', async ({ page, request, customer }) => {
    await withScenario(request, customer, async ({ fixture, accessToken }) => {
      await openReadyCheckout(page, fixture);
      await enterCard(page, cards.success);
      const created = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && /\/v1\/orders(?:\?|$)/.test(response.url()),
      );
      await submit(page);
      await created;
      await page.close();
      await expect
        .poll(async () => inspectFactoryPaymentState(request, accessToken), { timeout: 30_000 })
        .toMatchObject({
          orders: [{ status: 'cancelled', payments: [{ status: 'cancelled' }] }],
        });
      expectNoOrphans(await inspectFactoryPaymentState(request, accessToken), {
        orders: 1,
        orderStatuses: ['cancelled'],
        paymentStatuses: ['cancelled'],
      });
    });
  });
});
