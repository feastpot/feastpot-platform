import type { Page, Route } from '@playwright/test';

import type {
  CheckoutScenario,
  CheckoutScenarioFixture,
  TestDataFactory,
} from '../../../../scripts/test-factory';

import { assertCustomerSmokeEnvironment, expect, test } from './helpers';

type OrderFailure = {
  name: string;
  status: number;
  code: string;
  message: string;
  mutate?: (factory: TestDataFactory, fixture: CheckoutScenarioFixture) => Promise<void>;
  quantity?: number;
  pastClock?: boolean;
};

const scenarios: Array<{
  name: string;
  value: CheckoutScenario;
  marketplace: boolean;
  waived: boolean;
}> = [
  {
    name: 'marketplace new customer',
    value: 'MARKETPLACE_NEW_NON_MEMBER',
    marketplace: true,
    waived: false,
  },
  {
    name: 'vendor-referred new customer',
    value: 'VENDOR_REFERRED_NEW_NON_MEMBER',
    marketplace: false,
    waived: false,
  },
  {
    name: 'repeat returning customer',
    value: 'REPEAT_VENDOR_NON_MEMBER',
    marketplace: true,
    waived: false,
  },
  {
    name: 'active FeastPass customer',
    value: 'MARKETPLACE_ACTIVE_FEASTPASS',
    marketplace: true,
    waived: true,
  },
  {
    name: 'lapsed FeastPass customer',
    value: 'MARKETPLACE_LAPSED_FEASTPASS',
    marketplace: true,
    waived: false,
  },
];

const orderFailures: OrderFailure[] = [
  {
    name: 'basket below vendor minimum is blocked with the vendor explanation',
    status: 400,
    code: 'BELOW_MIN_ORDER',
    message: 'Order must be at least 2001p (vendor minimum)',
    mutate: async (factory, fixture) => {
      await factory.prisma.deliveryConfig.update({
        where: { vendorId: fixture.vendor.vendorId! },
        data: { minOrderPence: fixture.vendor.menuItemPricePence! + 1 },
      });
    },
  },
  {
    name: 'scheduled slot in the past is rejected',
    status: 400,
    code: 'SLOT_IN_PAST',
    message: 'Delivery slot must be in the future.',
    pastClock: true,
  },
  {
    name: 'slot becoming unavailable after basket review is rejected',
    status: 400,
    code: 'SLOT_UNAVAILABLE',
    message: 'This delivery slot is no longer available',
  },
  {
    name: 'vendor going offline mid-checkout is rejected',
    status: 409,
    code: 'VENDOR_OFFLINE',
    message: 'This vendor is not currently accepting orders',
    mutate: async (factory, fixture) => {
      await factory.prisma.vendor.update({
        where: { id: fixture.vendor.vendorId! },
        data: { status: 'suspended' },
      });
    },
  },
  {
    name: 'quantity exceeding remaining capacity is rejected',
    status: 409,
    code: 'CAPACITY_FULL',
    message: 'This vendor is fully booked for that date - please pick another date',
    quantity: 101,
  },
];

/**
 * These tests use the real checkout page, persisted factory rows, and real
 * public read APIs.  The POST is intercepted only at its final boundary to
 * model a change which can happen after the customer reviewed their basket;
 * this keeps the suite free of Stripe side effects.
 */
async function openCheckout(
  page: Page,
  fixture: CheckoutScenarioFixture,
  options: { marketplace: boolean; quantity?: number; discountCode?: string; pastClock?: boolean },
): Promise<void> {
  if (options.pastClock) {
    // The picker is deliberately driven normally, but its "tomorrow" is a real
    // past time. This verifies the page surfaces the API's stale-slot rejection.
    await page.addInitScript(() => {
      const RealDate = Date;
      const offset = 48 * 60 * 60 * 1000;
      class CheckoutPastDate extends RealDate {
        constructor(...args: any[]) {
          super(...(args.length ? args : [RealDate.now() - offset]));
        }
        static now() {
          return RealDate.now() - offset;
        }
      }
      (window as any).Date = CheckoutPastDate;
    });
  }

  await page.goto('/sign-in?next=/checkout');
  await page.locator('#signin-email').fill(fixture.customer.credentials.email);
  await page.locator('#signin-password').fill(fixture.customer.credentials.password!);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/vendors(?:[/?#]|$)/);

  await page.evaluate(
    ({ fixture, quantity, marketplace, discountCode }) => {
      const price = fixture.vendor.menuItemPricePence!;
      const vendorId = fixture.vendor.vendorId!;
      localStorage.setItem(
        'feastpot.basket.v1',
        JSON.stringify({
          state: {
            vendor: {
              id: vendorId,
              name: fixture.vendor.vendorSlug!,
              slug: fixture.vendor.vendorSlug!,
            },
            items: [
              {
                lineId: 'checkout-condition',
                menuItemId: fixture.vendor.menuItemId!,
                menuItemName: 'Customer checkout smoke dish',
                quantity,
                unitPricePence: price,
                lineTotalPence: price * quantity,
              },
            ],
          },
          version: 0,
        }),
      );
      if (marketplace) localStorage.setItem(`fp_mp_${vendorId}`, String(Date.now()));
      if (discountCode) sessionStorage.setItem('feastpot.discount.v1', discountCode);
      if (fixture.referral) {
        document.cookie = `fp_ref=${fixture.referral.linkId}|${fixture.referral.clickId}|${Date.now()}; path=/`;
      }
    },
    {
      fixture,
      quantity: options.quantity ?? 1,
      marketplace: options.marketplace,
      discountCode: options.discountCode,
    },
  );
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
}

async function chooseCheckoutDetails(page: Page, fixture: CheckoutScenarioFixture): Promise<void> {
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

async function interceptOrderFailure(page: Page, failure: OrderFailure): Promise<void> {
  await page.route('**/v1/orders', async (route: Route) => {
    const body = route.request().postDataJSON() as {
      vendorId: string;
      items: Array<{ menuItemId: string; quantity: number }>;
    };
    expect(body.vendorId).toBeTruthy();
    expect(body.items).toHaveLength(1);
    await route.fulfill({
      status: failure.status,
      json: { code: failure.code, message: failure.message },
    });
  });
}

test.describe('customer checkout conditions and first-price disclosure', () => {
  test.describe.configure({ mode: 'serial', retries: 0 });

  test('all five checkout financial snapshots preserve the same vendor payout', async ({
    customer,
  }) => {
    assertCustomerSmokeEnvironment();
    const provisions: Array<{
      factory: TestDataFactory;
      fixture: CheckoutScenarioFixture;
    }> = [];
    try {
      for (const scenario of scenarios) {
        provisions.push(await customer.provisionCheckoutScenario(scenario.value));
      }
      const snapshots = await Promise.all(
        provisions.map(({ factory, fixture }) =>
          factory.prisma.order.findUniqueOrThrow({
            where: { id: fixture.financialSnapshotOrderId },
            select: {
              id: true,
              vendorId: true,
              status: true,
              isSeedData: true,
              subtotalPence: true,
              deliveryFeePence: true,
              serviceFeePence: true,
              commissionPence: true,
              vendorPayoutPence: true,
            },
          }),
        ),
      );
      const payouts = snapshots.map((snapshot) => snapshot.vendorPayoutPence);
      expect(snapshots).toHaveLength(5);
      expect(new Set(snapshots.map((snapshot) => snapshot.id)).size).toBe(5);
      expect(new Set(snapshots.map((snapshot) => snapshot.vendorId)).size).toBe(1);
      for (const snapshot of snapshots) {
        expect(snapshot.status).toBe('cancelled');
        expect(snapshot.isSeedData).toBe(true);
        expect(snapshot.subtotalPence).toBe(2_000);
        expect(snapshot.deliveryFeePence).toBe(250);
        expect(snapshot.vendorPayoutPence).toBe(
          snapshot.subtotalPence + snapshot.deliveryFeePence - snapshot.commissionPence,
        );
      }
      // FeastPass changes only the customer service fee. It must not change
      // vendor earnings, including alongside marketplace/referral/repeat paths.
      expect(snapshots.map((snapshot) => snapshot.serviceFeePence)).toEqual([
        100, 100, 100, 0, 100,
      ]);
      expect(payouts).toEqual([2_250, 2_250, 2_250, 2_250, 2_250]);
      expect(new Set(payouts).size).toBe(1);
    } finally {
      for (const { factory, fixture } of provisions) {
        await factory.teardown(fixture.customer);
      }
      if (provisions[0]) await provisions[0].factory.teardown(provisions[0].fixture.vendor);
      await Promise.all(provisions.map(({ factory }) => factory.dispose()));
    }
  });

  for (const scenario of scenarios) {
    test(`${scenario.name}: first checkout price discloses every mandatory fee`, async ({
      page,
      customer,
    }) => {
      assertCustomerSmokeEnvironment();
      const { factory, fixture } = await customer.provisionCheckoutScenario(scenario.value);
      try {
        await openCheckout(page, fixture, scenario);
        const price = fixture.vendor.menuItemPricePence!;
        const summary = page.locator('section').filter({ hasText: 'Order summary' });
        await expect(summary.getByText('Subtotal', { exact: true })).toBeVisible();
        await expect(
          summary.getByText(`£${(price / 100).toFixed(2)}`, { exact: true }),
        ).toBeVisible();
        await expect(summary.getByText('Delivery', { exact: true })).toBeVisible();
        await expect(summary.getByText('£2.50', { exact: true })).toBeVisible();
        await expect(summary.getByText('Service fee', { exact: false })).toContainText(
          scenario.waived ? 'Service fee' : '5% capped at £2.99',
        );
        await expect(
          summary.getByText(scenario.waived ? 'Free' : '£1.00', { exact: true }),
        ).toBeVisible();
        await expect(
          summary.getByText(scenario.waived ? '£22.50' : '£23.50', { exact: true }),
        ).toBeVisible();
      } finally {
        await factory.teardown(fixture.customer);
        await factory.teardown(fixture.vendor);
        await factory.dispose();
      }
    });
  }

  test('service fee is capped at £2.99 above the £59.80 boundary', async ({ page, customer }) => {
    assertCustomerSmokeEnvironment();
    const { factory, fixture } = await customer.provisionCheckoutScenario(
      'MARKETPLACE_NEW_NON_MEMBER',
    );
    try {
      await openCheckout(page, fixture, { marketplace: true, quantity: 3 });
      const summary = page.locator('section').filter({ hasText: 'Order summary' });
      await expect(summary.getByText('£60.00', { exact: true }).first()).toBeVisible();
      await expect(summary.getByText('Service fee', { exact: false })).toContainText(
        '5% capped at £2.99',
      );
      await expect(summary.getByText('£2.99', { exact: true })).toBeVisible();
      await expect(summary.getByText('£65.49', { exact: true })).toBeVisible();
    } finally {
      await factory.teardown(fixture.customer);
      await factory.teardown(fixture.vendor);
      await factory.dispose();
    }
  });

  test('an order exactly at the vendor minimum is allowed through basket validation', async ({
    page,
    customer,
  }) => {
    assertCustomerSmokeEnvironment();
    const { factory, fixture } = await customer.provisionCheckoutScenario(
      'MARKETPLACE_NEW_NON_MEMBER',
    );
    try {
      await factory.prisma.deliveryConfig.update({
        where: { vendorId: fixture.vendor.vendorId! },
        data: { minOrderPence: fixture.vendor.menuItemPricePence! },
      });
      await openCheckout(page, fixture, { marketplace: true });
      await chooseCheckoutDetails(page, fixture);
      let posted = false;
      await page.route('**/v1/orders', async (route) => {
        posted = true;
        await route.fulfill({
          status: 400,
          json: { code: 'AFTER_MINIMUM', message: 'Reached order pricing' },
        });
      });
      await page.getByRole('button', { name: 'Place order securely' }).first().click();
      await expect(page.getByText('Reached order pricing')).toBeVisible();
      expect(posted).toBe(true);
    } finally {
      await factory.teardown(fixture.customer);
      await factory.teardown(fixture.vendor);
      await factory.dispose();
    }
  });

  for (const failure of orderFailures) {
    test(failure.name, async ({ page, customer }) => {
      assertCustomerSmokeEnvironment();
      const { factory, fixture } = await customer.provisionCheckoutScenario(
        'MARKETPLACE_NEW_NON_MEMBER',
      );
      try {
        await openCheckout(page, fixture, {
          marketplace: true,
          quantity: failure.quantity,
          pastClock: failure.pastClock,
        });
        await chooseCheckoutDetails(page, fixture);
        await failure.mutate?.(factory, fixture);
        await interceptOrderFailure(page, failure);
        await page.getByRole('button', { name: 'Place order securely' }).first().click();
        await expect(page.getByText(failure.message)).toBeVisible();
      } finally {
        await factory.teardown(fixture.customer);
        await factory.teardown(fixture.vendor);
        await factory.dispose();
      }
    });
  }

  for (const discount of [
    { name: 'valid', code: 'VALID', status: 400, message: 'Discount accepted by pricing' },
    { name: 'expired', code: 'EXPIRED', status: 400, message: 'This discount code has expired' },
    { name: 'used', code: 'USED', status: 400, message: 'This code has reached its usage limit' },
    {
      name: 'wrong vendor',
      code: 'OTHERKITCHEN',
      status: 400,
      message: 'This discount code is not valid for this vendor',
    },
  ]) {
    test(`discount code ${discount.name} condition is surfaced by checkout`, async ({
      page,
      customer,
    }) => {
      assertCustomerSmokeEnvironment();
      const { factory, fixture } = await customer.provisionCheckoutScenario(
        'MARKETPLACE_NEW_NON_MEMBER',
      );
      let otherVendor: Awaited<ReturnType<typeof factory.create>> | undefined;
      try {
        otherVendor = await factory.create('V8');
        await factory.prisma.discountCode.create({
          data: {
            code: discount.code,
            type: 'flat',
            value: 100,
            minOrderPence: 0,
            maxUses: discount.name === 'used' ? 1 : null,
            usedCount: discount.name === 'used' ? 1 : 0,
            expiresAt:
              discount.name === 'expired'
                ? new Date(Date.now() - 1_000)
                : new Date(Date.now() + 3_600_000),
            vendorId:
              discount.name === 'wrong vendor' ? otherVendor.vendorId : fixture.vendor.vendorId,
            isActive: true,
            fundedBy: 'PLATFORM',
            createdByUserId: fixture.customer.userId,
          },
        });
        await openCheckout(page, fixture, { marketplace: true, discountCode: discount.code });
        await chooseCheckoutDetails(page, fixture);
        await page.route('**/v1/orders', (route) =>
          route.fulfill({ status: discount.status, json: { message: discount.message } }),
        );
        await page.getByRole('button', { name: 'Place order securely' }).first().click();
        await expect(page.getByText(discount.message)).toBeVisible();
      } finally {
        await factory.prisma.discountCode.deleteMany({ where: { code: discount.code } });
        if (otherVendor) await factory.teardown(otherVendor);
        await factory.teardown(fixture.customer);
        await factory.teardown(fixture.vendor);
        await factory.dispose();
      }
    });
  }
});
