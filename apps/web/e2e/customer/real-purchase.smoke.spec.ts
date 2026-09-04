import type { APIResponse } from '@playwright/test';

import { assertCustomerSmokeEnvironment, expect, test } from './helpers';

interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: string;
  metadata: Record<string, string>;
}

function safeApiResponseBody(body: string): string {
  const maxLength = 2_000;
  try {
    const redact = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(redact);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          /password|secret|token|authorization|cookie|email|phone|address|bank/i.test(key)
            ? '[REDACTED]'
            : redact(child),
        ]),
      );
    };
    return JSON.stringify(redact(JSON.parse(body))).slice(0, maxLength);
  } catch {
    return body
      .slice(0, maxLength)
      .replace(/(bearer\s+|token[=:]\s*|password[=:]\s*)[^\s,"]+/gi, '$1[REDACTED]');
  }
}

async function stripeRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; body: T }> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(30_000),
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
    test.setTimeout(240_000);
    assertCustomerSmokeEnvironment();
    const { factory, identities } = await customer.provision(['C2', 'V9']);
    console.info('[customer-smoke] fixtures provisioned');
    const customerIdentity = identities.find((identity) => identity.state === 'C2')!;
    const vendorIdentity = identities.find((identity) => identity.state === 'V9')!;
    const email = customerIdentity.credentials.email;
    const password = customerIdentity.credentials.password!;
    const addressId = customerIdentity.addressId!;
    const vendorId = vendorIdentity.vendorId!;
    const vendorSlug = vendorIdentity.vendorSlug!;
    const menuItemId = vendorIdentity.menuItemId!;
    const menuItemPricePence = vendorIdentity.menuItemPricePence!;
    const discountCode =
      `SMOKE${customerIdentity.userId.replaceAll('-', '').slice(0, 12)}`.toUpperCase();
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
      await factory.prisma.deliveryConfig.update({
        where: { vendorId },
        data: { minOrderPence: menuItemPricePence },
      });
      await factory.prisma.discountCode.create({
        data: {
          code: discountCode,
          type: 'flat',
          value: 100,
          minOrderPence: menuItemPricePence,
          maxUses: 1,
          usedCount: 0,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          vendorId,
          isActive: true,
          fundedBy: 'PLATFORM',
          createdByUserId: customerIdentity.userId,
        },
      });
      const apiOrigin = new URL(process.env.TEST_API_URL!).origin;
      const vendorPreflightUrl = `${process.env.TEST_API_URL}/v1/vendors/${vendorSlug}`;
      let apiVendor: APIResponse | undefined;
      let apiVendorRequestError: unknown;
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
          apiVendor = await page.request.get(vendorPreflightUrl, { timeout: 15_000 });
          apiVendorRequestError = undefined;
          if (apiVendor.ok() || apiVendor.status() < 500) break;
        } catch (error) {
          apiVendorRequestError = error;
        }
        if (attempt < 4) await page.waitForTimeout(2_000);
      }
      if (!apiVendor) {
        throw new Error(
          `CUSTOMER_E2E_VENDOR_PREFLIGHT_FAILED: API origin=${apiOrigin}; namespace=${process.env.TEST_FACTORY_NAMESPACE}; ` +
            `vendorSlug=${vendorSlug}; request failed: ${
              apiVendorRequestError instanceof Error
                ? apiVendorRequestError.message
                : String(apiVendorRequestError)
            }`,
        );
      }
      if (!apiVendor.ok()) {
        throw new Error(
          `CUSTOMER_E2E_VENDOR_PREFLIGHT_FAILED: API origin=${apiOrigin}; namespace=${process.env.TEST_FACTORY_NAMESPACE}; ` +
            `vendorSlug=${vendorSlug}; status=${apiVendor.status()}; response body=${safeApiResponseBody(await apiVendor.text())}`,
        );
      }
      expect(((await apiVendor.json()) as { id: string }).id).toBe(vendorId);
      console.info('[customer-smoke] vendor preflight passed');

      console.info('[customer-smoke] sign-in navigation started');
      await page.goto('/sign-in?next=/checkout', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      console.info('[customer-smoke] sign-in page ready');
      const signInButton = page.getByRole('button', { name: /sign in/i });
      await expect(signInButton).toBeEnabled();
      await page.locator('#signin-email').fill(email);
      await page.locator('#signin-password').fill(password);
      const authResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          /\/auth\/v1\/token(?:\?|$)/.test(response.url()),
        { timeout: 30_000 },
      );
      await signInButton.click();
      const authResponse = await authResponsePromise;
      if (!authResponse.ok()) {
        let errorCode = 'unknown';
        try {
          const body = (await authResponse.json()) as { error_code?: unknown; code?: unknown };
          const candidate = body.error_code ?? body.code;
          if (typeof candidate === 'string') {
            errorCode = candidate.replace(/[^a-z0-9_-]/gi, '').slice(0, 80) || 'unknown';
          }
        } catch {
          // Deliberately do not expose the raw authentication response.
        }
        throw new Error(
          `CUSTOMER_E2E_AUTH_FAILED: status=${authResponse.status()}; code=${errorCode}`,
        );
      }
      console.info('[customer-smoke] password authentication passed');
      await expect(page).toHaveURL(/\/vendors(?:[/?#]|$)/, { timeout: 20_000 });
      console.info('[customer-smoke] sign-in completed');

      await page.evaluate(
        ({ itemId, slug, id, pricePence, code }) => {
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
          sessionStorage.setItem('feastpot.discount.v1', code);
        },
        {
          itemId: menuItemId,
          slug: vendorSlug,
          id: vendorId,
          pricePence: menuItemPricePence,
          code: discountCode,
        },
      );
      console.info('[customer-smoke] basket prepared');

      await page.goto('/checkout', {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
      await expect(
        page.locator('#main-content').getByRole('heading', { name: 'Checkout', exact: true }),
      ).toBeVisible();
      console.info('[customer-smoke] checkout page ready');
      await page.locator(`input[name="address"][value="${addressId}"]`).check();
      const slotSection = page.locator('section').filter({ hasText: 'When do you need the food?' });
      await slotSection
        .getByRole('button', { name: /^Select \d{1,2} \w+$/ })
        .last()
        .click();
      await slotSection
        .getByRole('button', { name: /^Select \d{2}:00/ })
        .first()
        .click();
      await page.getByRole('checkbox').check();
      console.info('[customer-smoke] checkout selections completed');

      const cardFrame = page.frameLocator('iframe[title="Secure card payment input frame"]');
      await cardFrame.locator('input[name="exp-date"]').fill('1230');
      await cardFrame.locator('input[name="cvc"]').fill('123');
      await cardFrame.locator('input[name="postal"]').fill('SE15 4ST');
      console.info('[customer-smoke] Stripe fields ready');

      for (const [failureIndex, failure] of [
        { card: '4000000000000002', message: /card.*declined/i },
        { card: '4000000000009995', message: /insufficient funds/i },
      ].entries()) {
        console.info(`[customer-smoke] decline ${failureIndex + 1} started`);
        await cardFrame.locator('input[name="cardnumber"]').fill(failure.card);
        const failedOrderResponse = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' && /\/v1\/orders(?:\?|$)/.test(response.url()),
        );
        const cancellationResponse = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            /\/v1\/orders\/[^/]+\/cancel$/.test(response.url()),
        );
        await page.getByRole('button', { name: 'Place order securely' }).first().click();
        const orderResponse = await failedOrderResponse;
        if (!orderResponse.ok()) {
          void cancellationResponse.catch(() => undefined);
          const body = (await orderResponse.json().catch(() => null)) as {
            code?: unknown;
            message?: unknown;
            error?: unknown;
            statusCode?: unknown;
          } | null;
          throw new Error(
            `Customer smoke order create failed: status=${orderResponse.status()} body=${JSON.stringify(
              {
                statusCode: body?.statusCode,
                code: body?.code,
                message: body?.message,
                error: body?.error,
              },
            ).slice(0, 500)}`,
          );
        }
        console.info(`[customer-smoke] decline ${failureIndex + 1} order created`);
        expect((await cancellationResponse).ok()).toBeTruthy();
        console.info(`[customer-smoke] decline ${failureIndex + 1} cancellation completed`);
        await expect(page.locator('form p[role="alert"]')).toContainText(failure.message);

        const failedOrders = await factory.prisma.order.findMany({
          where: { customerId: customerIdentity.userId, vendorId },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { payments: true },
        });
        expect(failedOrders).toHaveLength(1);
        expect(failedOrders[0]!.status).toBe('cancelled');
        expect(failedOrders[0]!.payments).toHaveLength(1);
        expect(failedOrders[0]!.payments[0]!.status).toBe('cancelled');
        console.info(`[customer-smoke] decline ${failureIndex + 1} database state verified`);
        const failedIntent = await stripeRequest<StripePaymentIntent>(
          `/payment_intents/${failedOrders[0]!.payments[0]!.stripePaymentIntentId}`,
        );
        expect(failedIntent.response.ok).toBeTruthy();
        expect(failedIntent.body.status).toBe('canceled');
        console.info(`[customer-smoke] decline ${failureIndex + 1} Stripe state verified`);
      }

      console.info('[customer-smoke] 3DS success started');
      await cardFrame.locator('input[name="cardnumber"]').fill('4000002500003155');
      const orderResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && /\/v1\/orders(?:\?|$)/.test(response.url()),
      );
      await page.getByRole('button', { name: 'Place order securely' }).first().click();
      const orderResponse = await orderResponsePromise;
      expect(orderResponse.ok()).toBeTruthy();
      console.info('[customer-smoke] 3DS order created');
      const createdOrder = (await orderResponse.json()) as {
        order: { id: string };
        clientSecret: string;
      };
      cleanupOrderId = createdOrder.order.id;
      cleanupPaymentIntentId = createdOrder.clientSecret.split('_secret_')[0] ?? null;
      let authenticationFrame = page
        .frames()
        .find((frame) => /three-ds|3ds|authenticate/i.test(frame.url()));
      await expect
        .poll(
          () => {
            authenticationFrame = page
              .frames()
              .find((frame) => /three-ds|3ds|authenticate/i.test(frame.url()));
            return Boolean(authenticationFrame);
          },
          { timeout: 20_000 },
        )
        .toBe(true);
      console.info('[customer-smoke] 3DS frame ready');
      await authenticationFrame!.getByRole('button', { name: /complete|authenticate/i }).click();
      await expect(page).toHaveURL(/\/orders\/[^/]+\/confirmation$/, { timeout: 30_000 });
      console.info('[customer-smoke] 3DS order confirmed');
      await expect(page.getByText(/order confirmed|thanks/i)).toBeVisible();
      expect(orderCreates).toBe(3);

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
      expect(persisted.discountPence).toBe(100);
      expect(persisted.totalPence).toBe(
        persisted.subtotalPence +
          persisted.deliveryFeePence +
          persisted.serviceFeePence -
          persisted.discountPence,
      );

      const payments = await factory.prisma.payment.findMany({ where: { orderId } });
      const fixtureOrders = await factory.prisma.order.findMany({
        where: { customerId: customerIdentity.userId, vendorId, status: { not: 'cancelled' } },
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
      const appliedDiscount = await factory.prisma.discountCode.findUniqueOrThrow({
        where: { code: discountCode },
      });
      expect(appliedDiscount.usedCount).toBe(1);

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
      await factory.prisma.discountCode
        .deleteMany({ where: { code: discountCode } })
        .catch((error: unknown) =>
          cleanupErrors.push(
            error instanceof Error ? error : new Error('Discount fixture cleanup failed'),
          ),
        );
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
