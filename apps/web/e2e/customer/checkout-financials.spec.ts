import type { Page, Route } from '@playwright/test';

import { expect, test } from './helpers';

test.skip(
  !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  'Checkout pre-payment browser contracts require Stripe Elements to be configured.',
);

const vendorId = '11111111-1111-4111-8111-111111111111';
const menuItemId = '22222222-2222-4222-8222-222222222222';
const addressId = '33333333-3333-4333-8333-333333333333';
const firstVisiblePricePence = 2_000;

interface CheckoutFailure {
  name: string;
  status: number;
  code: string;
  message: string;
  discountCode?: string;
}

const failures: CheckoutFailure[] = [
  {
    name: 'basket below the vendor minimum',
    status: 400,
    code: 'BELOW_MIN_ORDER',
    message: 'Order must be at least 2500p (vendor minimum)',
  },
  {
    name: 'delivery slot became unavailable',
    status: 400,
    code: 'SLOT_UNAVAILABLE',
    message: 'This delivery slot is no longer available',
  },
  {
    name: 'vendor went offline during checkout',
    status: 409,
    code: 'VENDOR_OFFLINE',
    message: 'This vendor is not currently accepting orders',
  },
  {
    name: 'capacity became unavailable during checkout',
    status: 409,
    code: 'CAPACITY_FULL',
    message: 'This vendor is fully booked for that date - please pick another date',
  },
  {
    name: 'discount code is invalid',
    status: 400,
    code: 'DISCOUNT_INVALID',
    message: 'Invalid discount code',
    discountCode: 'NOTREAL',
  },
  {
    name: 'discount code expired at the boundary',
    status: 400,
    code: 'DISCOUNT_EXPIRED',
    message: 'This discount code has expired',
    discountCode: 'EXPIRED',
  },
  {
    name: 'discount usage limit was reached',
    status: 400,
    code: 'DISCOUNT_EXHAUSTED',
    message: 'This code has reached its usage limit',
    discountCode: 'LASTUSE',
  },
];

async function prepareCheckout(
  page: Page,
  orderHandler: (route: Route) => Promise<void>,
  discountCode?: string,
): Promise<void> {
  const supabaseRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0]!;
  await page.addInitScript(
    ({ ref, discount, vendorId, menuItemId, firstVisiblePricePence }) => {
      localStorage.setItem(
        `sb-${ref}-auth-token`,
        JSON.stringify({
          access_token: 'customer-e2e-access-token',
          refresh_token: 'customer-e2e-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: '44444444-4444-4444-8444-444444444444',
            aud: 'authenticated',
            role: 'authenticated',
            email: 'checkout@example.test',
            app_metadata: { role: 'customer' },
            user_metadata: {},
          },
        }),
      );
      localStorage.setItem(
        'feastpot.basket.v1',
        JSON.stringify({
          state: {
            vendor: { id: vendorId, name: 'Checkout Kitchen', slug: 'checkout-kitchen' },
            items: [
              {
                lineId: 'checkout-line',
                menuItemId,
                menuItemName: 'Checkout dish',
                quantity: 1,
                unitPricePence: firstVisiblePricePence,
                lineTotalPence: firstVisiblePricePence,
              },
            ],
          },
          version: 0,
        }),
      );
      if (discount) sessionStorage.setItem('feastpot.discount.v1', discount);
    },
    {
      ref: supabaseRef,
      discount: discountCode,
      vendorId,
      menuItemId,
      firstVisiblePricePence,
    },
  );

  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'POST' && url.pathname.endsWith('/v1/orders')) {
      await orderHandler(route);
      return;
    }
    if (url.pathname.endsWith('/v1/addresses')) {
      await route.fulfill({
        json: [
          {
            id: addressId,
            label: 'Home',
            line1: '1 Test Way',
            line2: null,
            city: 'London',
            postcode: 'SE15 4ST',
            country: 'GB',
            isDefault: true,
          },
        ],
      });
      return;
    }
    if (url.pathname.includes('/availability')) {
      await route.fulfill({
        json: {
          openingDays: [0, 1, 2, 3, 4, 5, 6],
          slotOpenHour: 9,
          slotCloseHour: 21,
          prepLeadHours: 1,
          sameDayOrders: true,
          blackoutDates: [],
          capacity: [],
        },
      });
      return;
    }
    if (url.pathname.includes('/vendors/checkout-kitchen')) {
      await route.fulfill({
        json: {
          id: vendorId,
          slug: 'checkout-kitchen',
          businessName: 'Checkout Kitchen',
          platformServiceFeeBps: 500,
          delivery: {
            types: ['local'],
            localRadiusMiles: 10,
            localFeePence: 250,
            freeDeliveryOverPence: null,
          },
          distanceKm: 1,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/v1/feastpass/me')) {
      await route.fulfill({ json: { subscription: null } });
      return;
    }
    if (url.pathname.includes('/loyalty')) {
      await route.fulfill({ json: { balance: 0, worthPence: 0 } });
      return;
    }
    await route.fulfill({
      status: 404,
      json: { message: `Unhandled fixture route ${url.pathname}` },
    });
  });

  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible();
  await expect(page.getByText('£20.00').first()).toBeVisible();
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
}

test.describe('browser checkout failure contracts', () => {
  for (const scenario of failures) {
    test(`${scenario.name} shows the API error without retrying`, async ({ page }) => {
      let creates = 0;
      await prepareCheckout(
        page,
        async (route) => {
          creates += 1;
          const body = route.request().postDataJSON() as {
            vendorId: string;
            items: Array<{ menuItemId: string; quantity: number }>;
            discountCode?: string;
          };
          expect(body.vendorId).toBe(vendorId);
          expect(body.items).toEqual([{ menuItemId, quantity: 1 }]);
          expect(body.discountCode).toBe(scenario.discountCode);
          await route.fulfill({
            status: scenario.status,
            json: { code: scenario.code, message: scenario.message },
          });
        },
        scenario.discountCode,
      );

      await page.getByRole('button', { name: 'Place order securely' }).first().click();
      await expect(page.getByText(scenario.message)).toBeVisible();
      expect(creates).toBe(1);
    });
  }

  test('exact minimum reaches order pricing and rapid double-submit creates once', async ({
    page,
  }) => {
    let creates = 0;
    await prepareCheckout(page, async (route) => {
      creates += 1;
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.fulfill({
        status: 504,
        json: {
          code: 'PAYMENT_TIMEOUT',
          message: 'Payment confirmation timed out. Please try again.',
        },
      });
    });

    const submit = page.getByRole('button', { name: 'Place order securely' }).first();
    await submit.dblclick({ delay: 20 });
    await expect(page.getByText('Payment confirmation timed out. Please try again.')).toBeVisible();
    expect(creates).toBe(1);
  });
});
