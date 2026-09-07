import type { Page } from '@playwright/test';

import type { CheckoutScenarioFixture } from '../../../../scripts/test-factory';

import {
  assertCustomerSmokeEnvironment,
  CustomerFixture,
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
  await page.goto('/sign-in?next=/checkout');
  await page.locator('#signin-email').fill(fixture.customer.credentials.email);
  await page.locator('#signin-password').fill(fixture.customer.credentials.password!);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/vendors(?:[/?#]|$)/);

  await page.evaluate(
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
  const card = page.frameLocator('iframe[name^="__privateStripeFrame"][title$="input frame" i]');
  await expect(card.locator('input[name="exp-date"]')).toBeVisible({ timeout: 30_000 });
  await card.locator('input[name="cardnumber"]').fill(number);
  await card.locator('input[name="exp-date"]').fill('1230');
  await card.locator('input[name="cvc"]').fill('123');
  await card.locator('input[autocomplete="postal-code"]').fill('SE15 4ST');
}

async function submit(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Place order securely' }).first().click();
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
  run: (input: { fixture: CheckoutScenarioFixture; accessToken: string }) => Promise<void>,
): Promise<void> {
  assertCustomerSmokeEnvironment();
  const { factory, fixture } = await customer.provisionCheckoutScenario(
    'MARKETPLACE_NEW_NON_MEMBER',
  );
  try {
    // Inspect with a token issued independently of the browser so closing the
    // checkout tab cannot remove the authority used by the assertion seam.
    const accessToken = await factory.issueAccessToken(fixture.customer);
    await run({ fixture, accessToken });
  } finally {
    await factory.teardown(fixture.customer);
    await factory.teardown(fixture.vendor);
    await factory.dispose();
  }
}

test.describe('customer payment outcomes', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  test('success', async ({ page, request, customer }) => {
    await withScenario(request, customer, async ({ fixture, accessToken }) => {
      await openReadyCheckout(page, fixture);
      await enterCard(page, cards.success);
      await submit(page);
      await expect(page).toHaveURL(/\/orders\/[^/]+\/confirmation$/, { timeout: 30_000 });
      await expect(page.getByText(/order confirmed|thanks/i)).toBeVisible();
      expectNoOrphans(await inspectFactoryPaymentState(request, accessToken), {
        orders: 1,
        orderStatuses: ['pending', 'accepted'],
        paymentStatuses: ['succeeded'],
      });
    });
  });

  for (const outcome of ['declined', 'insufficient funds'] as const) {
    test(outcome, async ({ page, request, customer }) => {
      await withScenario(request, customer, async ({ fixture, accessToken }) => {
        await openReadyCheckout(page, fixture);
        await enterCard(page, cards[outcome]);
        await submit(page);
        await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 });
        expectNoOrphans(await inspectFactoryPaymentState(request, accessToken), {
          orders: 1,
          orderStatuses: ['cancelled'],
          paymentStatuses: ['cancelled'],
        });
      });
    });
  }

  test('3DS completed', async ({ page, request, customer }) => {
    await withScenario(request, customer, async ({ fixture, accessToken }) => {
      await openReadyCheckout(page, fixture);
      await enterCard(page, cards['3DS completed']);
      await submit(page);
      await completeThreeDs(page);
      await expect(page).toHaveURL(/\/orders\/[^/]+\/confirmation$/, { timeout: 30_000 });
      expectNoOrphans(await inspectFactoryPaymentState(request, accessToken), {
        orders: 1,
        orderStatuses: ['pending', 'accepted'],
        paymentStatuses: ['succeeded'],
      });
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
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 });
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
      await Promise.all([submit(page), submit(page)]);
      await expect(page.getByRole('alert')).toBeVisible({ timeout: 30_000 });
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
