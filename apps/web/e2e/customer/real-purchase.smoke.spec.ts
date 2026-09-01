import { assertCustomerSmokeEnvironment, expect, test } from './helpers';

interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  metadata: Record<string, string>;
}

async function stripeRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; body: T }> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY_TEST}`,
      ...init.headers,
    },
  });
  return { response, body: (await response.json()) as T };
}

async function neutralisePaymentIntent(paymentIntentId: string, orderId: string): Promise<void> {
  const { response, body: intent } = await stripeRequest<StripePaymentIntent>(
    `/payment_intents/${paymentIntentId}`,
  );
  if (!response.ok) throw new Error(`STRIPE_CLEANUP_LOOKUP_FAILED: ${paymentIntentId}`);

  if (intent.status === 'succeeded') {
    const refund = await stripeRequest('/refunds', {
      method: 'POST',
      body: new URLSearchParams({ payment_intent: paymentIntentId }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Idempotency-Key': `customer-e2e-cleanup-${orderId}`,
      },
    });
    if (!refund.response.ok) throw new Error(`STRIPE_CLEANUP_REFUND_FAILED: ${paymentIntentId}`);
  } else if (!['canceled', 'cancelled'].includes(intent.status)) {
    const cancellation = await stripeRequest(`/payment_intents/${paymentIntentId}/cancel`, {
      method: 'POST',
      body: new URLSearchParams({ cancellation_reason: 'abandoned' }),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!cancellation.response.ok) {
      throw new Error(`STRIPE_CLEANUP_CANCEL_FAILED: ${paymentIntentId}`);
    }
  }
}

test.describe('real Stripe test-mode customer purchase', () => {
  // A retry must never create another Stripe PaymentIntent or order.
  test.describe.configure({ retries: 0 });

  test('CP-1: completes one isolated test-mode purchase without duplicates', async ({
    page,
    customer,
  }) => {
    assertCustomerSmokeEnvironment();
    const { factory, identities } = await customer.provision(['C2', 'V9']);
    const customerIdentity = identities.find((identity) => identity.state === 'C2')!;
    const vendorIdentity = identities.find((identity) => identity.state === 'V9')!;
    const email = customerIdentity.credentials.email;
    const password = customerIdentity.credentials.password!;
    const addressId = customerIdentity.addressId!;
    const vendorId = vendorIdentity.vendorId!;
    const vendorSlug = vendorIdentity.vendorSlug!;
    const menuItemId = vendorIdentity.menuItemId!;
    const menuItemPricePence = vendorIdentity.menuItemPricePence!;
    let orderCreates = 0;
    let accessToken: string | null = null;
    let apiCleanupSucceeded = false;
    let cleanupOrderId: string | null = null;
    let cleanupPaymentIntentId: string | null = null;

    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/v1\/orders(?:\?|$)/.test(request.url())) {
        orderCreates += 1;
        accessToken = request.headers().authorization?.replace(/^Bearer\s+/i, '') ?? null;
      }
    });

    try {
      const apiVendor = await page.request.get(
        `${process.env.TEST_API_URL}/v1/vendors/${vendorSlug}`,
      );
      expect(apiVendor.ok()).toBeTruthy();
      expect(((await apiVendor.json()) as { id: string }).id).toBe(vendorId);

      await page.goto('/sign-in?next=/checkout');
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/checkout|vendors/, { timeout: 20_000 });

      await page.evaluate(
        ({ itemId, slug, id, pricePence }) => {
          localStorage.setItem(
            'feastpot.basket.v1',
            JSON.stringify({
              state: {
                vendor: { id, name: slug, slug },
                items: [
                  {
                    lineId: 'customer-e2e',
                    menuItemId: itemId,
                    menuItemName: 'Customer checkout smoke dish',
                    quantity: 1,
                    unitPricePence: pricePence,
                    lineTotalPence: pricePence,
                  },
                ],
              },
              version: 0,
            }),
          );
        },
        { itemId: menuItemId, slug: vendorSlug, id: vendorId, pricePence: menuItemPricePence },
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
      const createdOrder = (await orderResponse.json()) as {
        order: { id: string };
        clientSecret: string;
      };
      cleanupOrderId = createdOrder.order.id;
      cleanupPaymentIntentId = createdOrder.clientSecret.split('_secret_')[0] ?? null;
      await expect(page).toHaveURL(/\/orders\/[^/]+\/confirmation$/, { timeout: 30_000 });
      await expect(page.getByText(/order confirmed|thanks/i)).toBeVisible();
      expect(orderCreates).toBe(1);

      const orderId = page.url().match(/\/orders\/([^/]+)\/confirmation$/)?.[1];
      expect(orderId).toBeTruthy();
      expect(orderId).toBe(cleanupOrderId);
      expect(accessToken).toBeTruthy();
      const result = await page.request.get(
        `${process.env.NEXT_PUBLIC_API_URL}/v1/orders/${orderId}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
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
      expect(persisted.subtotalPence).toBe(menuItemPricePence);
      expect(persisted.totalPence).toBe(
        persisted.subtotalPence +
          persisted.deliveryFeePence +
          persisted.serviceFeePence -
          persisted.discountPence,
      );

      const payments = await factory.prisma.payment.findMany({ where: { orderId } });
      const fixtureOrders = await factory.prisma.order.findMany({
        where: { customerId: customerIdentity.userId, vendorId },
      });
      expect(fixtureOrders).toHaveLength(1);
      expect(payments).toHaveLength(1);
      expect(payments[0]!.amountPence).toBe(persisted.totalPence);
      expect(payments[0]!.stripePaymentIntentId).toBeTruthy();
      const paymentIntentId = payments[0]!.stripePaymentIntentId!;
      expect(paymentIntentId).toBe(cleanupPaymentIntentId);
      const stripe = await stripeRequest<StripePaymentIntent>(
        `/payment_intents/${paymentIntentId}`,
      );
      expect(stripe.response.ok).toBeTruthy();
      expect(stripe.body.amount).toBe(persisted.totalPence);
      expect(stripe.body.currency).toBe('gbp');
      expect(stripe.body.metadata.orderId).toBe(orderId);
      const search = new URLSearchParams({ query: `metadata['orderId']:'${orderId}'` });
      const matchingIntents = await stripeRequest<{ data: StripePaymentIntent[] }>(
        `/payment_intents/search?${search}`,
      );
      expect(matchingIntents.response.ok).toBeTruthy();
      expect(matchingIntents.body.data).toHaveLength(1);

      const cancellation = await page.request.post(
        `${process.env.NEXT_PUBLIC_API_URL}/v1/orders/${orderId}/cancel`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          data: { reason: 'Completed isolated customer checkout smoke test' },
        },
      );
      expect(cancellation.ok()).toBeTruthy();
      const cancelledIntent = await stripeRequest<StripePaymentIntent>(
        `/payment_intents/${paymentIntentId}`,
      );
      expect(cancelledIntent.response.ok).toBeTruthy();
      expect(cancelledIntent.body.status).toBe('canceled');
      apiCleanupSucceeded = true;
    } finally {
      const cleanupErrors: Error[] = [];
      let orders: Array<{
        id: string;
        payments: Array<{ stripePaymentIntentId: string | null }>;
      }> = [];
      try {
        orders = await factory.prisma.order.findMany({
          where: { customerId: customerIdentity.userId, vendorId },
          include: { payments: true },
        });
      } catch (error) {
        cleanupErrors.push(
          error instanceof Error ? error : new Error('Order cleanup lookup failed'),
        );
      }
      if (!apiCleanupSucceeded) {
        const paymentIntents = new Map<string, string>();
        if (cleanupPaymentIntentId && cleanupOrderId) {
          paymentIntents.set(cleanupPaymentIntentId, cleanupOrderId);
        }
        for (const order of orders) {
          for (const payment of order.payments) {
            if (payment.stripePaymentIntentId) {
              paymentIntents.set(payment.stripePaymentIntentId, order.id);
            }
          }
        }
        for (const [paymentIntentId, orderId] of paymentIntents) {
          await neutralisePaymentIntent(paymentIntentId, orderId).catch((error: unknown) =>
            cleanupErrors.push(
              error instanceof Error ? error : new Error('Unknown Stripe cleanup failure'),
            ),
          );
        }
      }
      await factory
        .teardown(customerIdentity)
        .catch((error: unknown) =>
          cleanupErrors.push(
            error instanceof Error ? error : new Error('Customer fixture cleanup failed'),
          ),
        );
      await factory
        .teardown(vendorIdentity)
        .catch((error: unknown) =>
          cleanupErrors.push(
            error instanceof Error ? error : new Error('Vendor fixture cleanup failed'),
          ),
        );
      await factory
        .dispose()
        .catch((error: unknown) =>
          cleanupErrors.push(error instanceof Error ? error : new Error('Factory disposal failed')),
        );
      if (cleanupErrors.length) {
        throw new AggregateError(cleanupErrors, 'Customer E2E cleanup failed');
      }
    }
  });
});
