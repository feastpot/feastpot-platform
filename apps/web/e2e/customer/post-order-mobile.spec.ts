import type { Page, Route } from '@playwright/test';

import {
  assertCustomerSmokeEnvironment,
  expect,
  inspectFactoryPaymentState,
  test,
} from './helpers';
import { mockSession, mockSignin } from '../auth/helpers/supabase-mock';
import { SB } from '../auth/helpers/selectors';

type FixtureStatus =
  | 'pending'
  | 'cancellation_pending'
  | 'accepted'
  | 'needs_clarification'
  | 'preparing'
  | 'ready'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

const baseOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-1',
  orderNumber: 'FP-1001',
  status: 'delivered' as FixtureStatus,
  subtotalPence: 1_000,
  deliveryFeePence: 200,
  serviceFeePence: 50,
  discountPence: 0,
  totalPence: 1_250,
  scheduledFor: '2030-01-02T12:00:00.000Z',
  createdAt: '2030-01-01T12:00:00.000Z',
  customerId: 'mock-user-id',
  vendorId: 'vendor-1',
  notes: null,
  acceptedAt: '2030-01-01T12:10:00.000Z',
  dispatchedAt: '2030-01-02T11:45:00.000Z',
  deliveredAt: '2030-01-02T12:10:00.000Z',
  cancelledAt: null,
  etaMinutes: null,
  etaAt: null,
  vendor: {
    id: 'vendor-1',
    businessName: 'Fixture Kitchen',
    slug: 'fixture-kitchen',
    user: { phone: '+447700900123' },
  },
  items: [
    {
      id: 'item-1',
      menuItemId: 'menu-1',
      nameSnapshot: 'Peanut stew',
      quantity: 1,
      unitPence: 1_000,
      totalPence: 1_000,
      notes: null,
    },
  ],
  amendments: [],
  disputes: [],
  ...overrides,
});

async function signIn(page: Page): Promise<void> {
  const session = mockSession();
  await mockSignin(page, session);
  await page.route(SB.user, (route) => route.fulfill({ json: session.user }));
  await page.goto('/sign-in');
  await page.getByLabel(/email/i).fill('test@example.com');
  await page.locator('input[name="password"]').fill('Password1!');
  await page.getByRole('button', { name: /sign in/i }).click();
}

async function fulfillOrder(route: Route, order: ReturnType<typeof baseOrder>): Promise<void> {
  await route.fulfill({ json: order });
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(widths.scrollWidth).toBe(widths.clientWidth);
}

async function expectMobilePageWidth(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(widths.scrollWidth).toBeLessThanOrEqual(widths.clientWidth);
}

async function enterDeterministicSuccessCard(page: Page): Promise<void> {
  const card = page.frameLocator('iframe[name^="__privateStripeFrame"][title$="input frame" i]');
  await expect(card.locator('input[name="exp-date"]')).toBeVisible({ timeout: 30_000 });
  // This is the same test-mode success card used by payment-states.spec.ts;
  // no alternate Stripe adapter or live-mode payment path is introduced here.
  await card.locator('input[name="cardnumber"]').fill('4242424242424242');
  await card.locator('input[name="exp-date"]').fill('1230');
  await card.locator('input[name="cvc"]').fill('123');
  await card.locator('input[autocomplete="postal-code"]').fill('SE15 4ST');
}

async function signInFactoryCustomer(
  page: Page,
  credentials: { email: string; password: string | null },
  next: string,
): Promise<void> {
  if (!credentials.password) throw new Error('CUSTOMER_E2E_FACTORY_PASSWORD_REQUIRED');
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await page.locator('#signin-email').fill(credentials.email);
  await page.locator('#signin-password').fill(credentials.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(new RegExp(next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

test.describe('post-order customer journeys', () => {
  test('375px homepage discovery through payment, confirmation, and order history', async ({
    page,
    request,
    customer,
  }) => {
    test.setTimeout(120_000);
    assertCustomerSmokeEnvironment();
    await page.setViewportSize({ width: 375, height: 812 });
    const { factory, fixture } = await customer.provisionCheckoutScenario(
      'MARKETPLACE_NEW_NON_MEMBER',
    );
    try {
      const accessToken = await factory.issueAccessToken(fixture.customer);

      await page.goto('/');
      await expect(page.locator('#hero-postcode')).toBeVisible();
      await expectMobilePageWidth(page);
      await page.locator('#hero-postcode').fill('SE15 4ST');
      await page.getByRole('button', { name: /find food near me/i }).click();
      await expect(page).toHaveURL(/\/vendors\?postcode=SE15(?:%20|\+)4ST/);
      await expectMobilePageWidth(page);

      await page.locator(`a[href="/vendors/${fixture.vendor.vendorSlug}#menu"]`).click();
      await expect(page).toHaveURL(new RegExp(`/vendors/${fixture.vendor.vendorSlug}`));
      await expect(page.getByRole('heading')).toBeVisible();
      await expectMobilePageWidth(page);
      await page
        .getByRole('button', { name: /add .* to basket/i })
        .first()
        .click();
      await page.getByText('View basket', { exact: true }).click();
      await expect(page.getByText('Your basket', { exact: true })).toBeVisible();
      await expectMobilePageWidth(page);
      await page.getByRole('button', { name: /checkout/i }).click();

      await expect(page).toHaveURL(/\/sign-in\?next=%2Fcheckout/);
      await expectMobilePageWidth(page);
      await page.locator('#signin-email').fill(fixture.customer.credentials.email);
      await page.locator('#signin-password').fill(fixture.customer.credentials.password!);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/checkout$/);
      await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
      await expectMobilePageWidth(page);
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
      await enterDeterministicSuccessCard(page);
      await page.getByRole('button', { name: 'Place order securely' }).first().click();

      await expect(page).toHaveURL(/\/orders\/[^/]+\/confirmation$/, { timeout: 30_000 });
      await expect(page.getByText(/order confirmed|thanks/i)).toBeVisible();
      await expectMobilePageWidth(page);
      const state = await inspectFactoryPaymentState(request, accessToken);
      expect(state.orders).toHaveLength(1);
      expect(state.orders[0]!.payments).toHaveLength(1);
      expect(state.orders[0]!.payments[0]!.orderId).toBe(state.orders[0]!.id);
      expect(state.orders[0]!.status).toMatch(/^(pending|accepted)$/);
      expect(state.orders[0]!.payments[0]!.status).toBe('succeeded');

      await page.goto('/orders');
      await expect(page.getByRole('heading', { name: 'Your orders' })).toBeVisible();
      await expect(page.getByText(/pending|order placed/i)).toBeVisible();
      await expectMobilePageWidth(page);
    } finally {
      await factory.teardown(fixture.customer);
      await factory.teardown(fixture.vendor);
      await factory.dispose();
    }
  });

  test('order history displays financial states and reorder rebuilds the basket', async ({
    page,
  }) => {
    await signIn(page);
    const orders = [
      baseOrder(),
      baseOrder({
        id: 'order-refunded',
        orderNumber: 'FP-1002',
        status: 'refunded',
      }),
      baseOrder({
        id: 'order-partial',
        orderNumber: 'FP-1003',
        status: 'partially_refunded',
      }),
      baseOrder({
        id: 'order-cancelling',
        orderNumber: 'FP-1004',
        status: 'cancellation_pending',
      }),
    ];
    await page.route('**/v1/orders', (route) =>
      route.fulfill({ json: { data: orders, nextCursor: null } }),
    );
    await page.route('**/v1/vendors/vendor-1', (route) =>
      route.fulfill({
        json: {
          id: 'vendor-1',
          businessName: 'Fixture Kitchen',
          slug: 'fixture-kitchen',
        },
      }),
    );

    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'Your orders' })).toBeVisible();
    await expect(page.getByText('Delivered', { exact: true })).toBeVisible();
    await expect(page.getByText('Refunded', { exact: true })).toBeVisible();
    await expect(page.getByText('Partially refunded', { exact: true })).toBeVisible();
    await expect(page.getByText('Cancelling', { exact: true })).toBeVisible();

    const delivered = page.locator('li').filter({ hasText: '#FP-1001' });
    await delivered.getByRole('button', { name: 'Reorder' }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    const basket = await page.evaluate(() => localStorage.getItem('feastpot.basket.v1'));
    expect(basket).toContain('Peanut stew');
    expect(basket).toContain('menu-1');
  });

  test('confirmation names each authoritative charge and the ordered-item allergen summary', async ({
    page,
  }) => {
    await signIn(page);
    await page.route('**/v1/orders/order-confirmation', (route) =>
      fulfillOrder(
        route,
        baseOrder({
          id: 'order-confirmation',
          subtotalPence: 1_000,
          deliveryFeePence: 200,
          serviceFeePence: 50,
          discountPence: 100,
          totalPence: 1_150,
          items: [
            {
              id: 'item-confirmation',
              menuItemId: 'menu-confirmation',
              nameSnapshot: 'Peanut stew',
              quantity: 1,
              unitPence: 1_000,
              totalPence: 1_000,
              notes: null,
              menuItem: { allergens: ['peanuts', 'soy'] },
            },
          ],
        }),
      ),
    );
    await page.route('**/v1/feastpass/savings-potential', (route) =>
      route.fulfill({ json: { savingsPotentialPence: 0 } }),
    );

    await page.goto('/orders/order-confirmation/confirmation');
    const totals = page.getByLabel('Order totals');
    await expect(totals).toContainText('Subtotal');
    await expect(totals).toContainText('£10.00');
    await expect(totals).toContainText('Delivery fee');
    await expect(totals).toContainText('£2.00');
    await expect(totals).toContainText('Service fee');
    await expect(totals).toContainText('£0.50');
    await expect(totals).toContainText('Discount');
    await expect(totals).toContainText('−£1.00');
    await expect(page.getByLabel('Total paid')).toContainText('£11.50');
    await expect(page.getByLabel('Allergen summary')).toContainText(
      'Contains or may contain: peanuts, soy.',
    );
  });

  test('tracking refreshes from placed to accepted and renders each stage', async ({ page }) => {
    await signIn(page);
    let reads = 0;
    await page.route('**/v1/orders/order-track', async (route) => {
      reads += 1;
      await fulfillOrder(
        route,
        baseOrder({
          id: 'order-track',
          status: reads === 1 ? 'pending' : 'accepted',
          acceptedAt: reads === 1 ? null : '2030-01-01T12:10:00.000Z',
          dispatchedAt: null,
          deliveredAt: null,
        }),
      );
    });

    await page.goto('/orders/order-track/tracking');
    await expect(page.getByText('Order placed')).toBeVisible();
    await expect(page.getByText('In progress')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Vendor accepted')).toBeVisible();
    await expect(page.getByText('Accepted at')).toBeVisible();
    expect(reads).toBeGreaterThanOrEqual(2);
  });

  test('tracking gives clarification and ready orders an explicit current state', async ({
    page,
  }) => {
    await signIn(page);
    await page.route('**/v1/orders/order-clarification', (route) =>
      fulfillOrder(
        route,
        baseOrder({
          id: 'order-clarification',
          status: 'needs_clarification',
          dispatchedAt: null,
          deliveredAt: null,
        }),
      ),
    );
    await page.route('**/v1/orders/order-ready', (route) =>
      fulfillOrder(
        route,
        baseOrder({
          id: 'order-ready',
          status: 'ready',
          dispatchedAt: null,
          deliveredAt: null,
        }),
      ),
    );

    await page.goto('/orders/order-clarification/tracking');
    await expect(page.getByText('Vendor needs clarification')).toBeVisible();
    await expect(page.getByText('In progress')).toBeVisible();
    await page.goto('/orders/order-ready/tracking');
    await expect(page.getByText('Ready for collection or dispatch')).toBeVisible();
    await expect(page.getByText('In progress')).toBeVisible();
  });

  test('eligible customer cancellation sends the reason and returns to history', async ({
    page,
  }) => {
    await signIn(page);
    const pending = baseOrder({
      id: 'order-cancel',
      status: 'pending',
      acceptedAt: null,
      dispatchedAt: null,
      deliveredAt: null,
    });
    let cancellationBody: unknown;
    await page.route('**/v1/orders/order-cancel**', async (route) => {
      if (route.request().method() === 'POST') {
        cancellationBody = route.request().postDataJSON();
        await fulfillOrder(
          route,
          baseOrder({
            ...pending,
            status: 'cancelled',
            cancelledAt: '2030-01-01T12:05:00.000Z',
          }),
        );
        return;
      }
      await fulfillOrder(route, pending);
    });
    await page.route('**/v1/orders', (route) =>
      route.fulfill({
        json: {
          data: [baseOrder({ ...pending, status: 'cancelled' })],
          nextCursor: null,
        },
      }),
    );

    await page.goto('/orders/order-cancel/tracking');
    await page.getByRole('button', { name: 'Cancel order' }).click();
    await page.getByPlaceholder('Tell us why (required)').fill('Plans have changed');
    await page.getByRole('button', { name: 'Confirm cancel' }).click();
    await expect(page).toHaveURL(/\/orders\?cancelled=1$/);
    expect(cancellationBody).toEqual({ reason: 'Plans have changed' });
  });

  test('server rejection after the cancellation cutoff remains on tracking with guidance', async ({
    page,
  }) => {
    await signIn(page);
    const accepted = baseOrder({
      id: 'order-cutoff',
      status: 'accepted',
      dispatchedAt: null,
      deliveredAt: null,
    });
    await page.route('**/v1/orders/order-cutoff**', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 400,
          json: {
            code: 'ORDER_NOT_CANCELLABLE',
            message: 'Your order is already being prepared - please contact the vendor',
          },
        });
        return;
      }
      await fulfillOrder(route, accepted);
    });

    await page.goto('/orders/order-cutoff/tracking');
    await page.getByRole('button', { name: 'Cancel order' }).click();
    await page.getByPlaceholder('Tell us why (required)').fill('No longer required');
    await page.getByRole('button', { name: 'Confirm cancel' }).click();
    await expect(
      page.getByText('Your order is already being prepared - please contact the vendor'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/orders\/order-cutoff\/tracking$/);
  });

  test('refund and open-dispute states give the customer explicit status', async ({ page }) => {
    await signIn(page);
    await page.route('**/v1/orders/order-refunded', (route) =>
      fulfillOrder(route, baseOrder({ id: 'order-refunded', status: 'refunded' })),
    );
    await page.route('**/v1/orders/order-dispute', (route) =>
      fulfillOrder(
        route,
        baseOrder({
          id: 'order-dispute',
          disputes: [
            {
              id: 'dispute-1',
              status: 'vendor_contacted',
              issueType: 'quality',
              severity: 'medium',
              description: 'Food arrived cold',
              createdAt: '2030-01-02T13:00:00.000Z',
            },
          ],
        }),
      ),
    );

    await page.goto('/orders/order-refunded/tracking');
    await expect(page.getByText('Order refunded')).toBeVisible();
    await expect(page.getByText(/payment has been refunded/i)).toBeVisible();
    await page.goto('/orders/order-dispute/tracking');
    await expect(page.getByRole('region', { name: 'Order dispute' })).toContainText(
      'vendor contacted',
    );
    await expect(page.getByText('Need help with this order?')).toBeVisible();
  });

  test('refund request creates an authoritative dispute record for the factory customer', async ({
    page,
    request,
    customer,
  }) => {
    test.setTimeout(90_000);
    assertCustomerSmokeEnvironment();
    const { factory, identities } = await customer.provision(['C3']);
    const identity = identities[0]!;
    const accessToken = await factory.issueAccessToken(identity);
    try {
      await signInFactoryCustomer(
        page,
        identity.credentials,
        `/orders/${identity.orderId}/tracking`,
      );
      await page.getByRole('button', { name: 'Request a refund' }).click();
      await page
        .getByLabel('What happened?')
        .fill('The meal arrived cold and was not safe to eat.');
      await page.getByRole('button', { name: 'Submit refund request' }).click();
      await expect(page.getByRole('status')).toContainText('submitted for review');

      const state = await inspectFactoryPaymentState(request, accessToken);
      const order = state.orders.find((candidate) => candidate.id === identity.orderId);
      expect(order).toBeDefined();
      expect(order!.disputes).toHaveLength(1);
      expect(order!.disputes[0]).toMatchObject({ orderId: identity.orderId, status: 'open' });
    } finally {
      await factory.teardown(identity);
      await factory.dispose();
    }
  });

  test('review is blocked before delivery, then accepts the tracking-page rating after delivery', async ({
    page,
  }) => {
    await signIn(page);
    await page.route('**/v1/orders/order-review-pending', (route) =>
      fulfillOrder(
        route,
        baseOrder({
          id: 'order-review-pending',
          status: 'accepted',
          dispatchedAt: null,
          deliveredAt: null,
        }),
      ),
    );
    await page.goto('/orders/order-review-pending/review');
    await expect(page.getByRole('heading', { name: 'Order not yet delivered' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit review' })).toHaveCount(0);

    await page.route('**/v1/orders/order-review-delivered', (route) =>
      fulfillOrder(route, baseOrder({ id: 'order-review-delivered' })),
    );
    let reviewBody: unknown;
    await page.route('**/v1/reviews', async (route) => {
      reviewBody = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        json: { id: 'review-1', orderId: 'order-review-delivered', rating: 4 },
      });
    });
    await page.goto('/orders/order-review-delivered/review?rating=4');
    await expect(page.getByRole('heading', { name: 'Leave a review' })).toBeVisible();
    await page.getByLabel('Your review (optional)').fill('Delicious and arrived on time.');
    await page.getByRole('button', { name: 'Submit review' }).click();
    await expect(page.getByRole('heading', { name: 'Thanks for your review!' })).toBeVisible();
    expect(reviewBody).toEqual({
      orderId: 'order-review-delivered',
      rating: 4,
      body: 'Delicious and arrived on time.',
    });
  });

  test('history, tracking, refund, and review states do not overflow a 375px viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page);
    await page.route('**/v1/orders', (route) =>
      route.fulfill({ json: { data: [baseOrder()], nextCursor: null } }),
    );
    await page.route('**/v1/orders/order-mobile', (route) =>
      fulfillOrder(route, baseOrder({ id: 'order-mobile', status: 'refunded' })),
    );
    await page.route('**/v1/orders/order-mobile-review', (route) =>
      fulfillOrder(
        route,
        baseOrder({
          id: 'order-mobile-review',
          status: 'accepted',
          dispatchedAt: null,
          deliveredAt: null,
        }),
      ),
    );

    for (const path of [
      '/orders',
      '/orders/order-mobile/tracking',
      '/orders/order-mobile-review/review',
    ]) {
      await page.goto(path);
      await expectNoHorizontalOverflow(page);
    }
  });
});
