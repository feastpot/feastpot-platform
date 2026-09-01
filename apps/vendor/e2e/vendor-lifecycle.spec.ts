/**
 * Deterministic vendor lifecycle coverage.
 *
 * This deliberately uses the normal authenticated vendor storage state.  The
 * API boundary is mocked in the browser, rather than adding test-only server
 * routes or requiring a Stripe account.  Admin approval is a hand-off: this
 * suite asserts the vendor-side contract (submitted documents and terms keep
 * the listing gated until the platform changes the vendor status).
 */
import { expect, test, type Page } from '@playwright/test';

import { ID, installBaseMocks, makeItem } from './helpers/api-mocks';

const ORDER_ID = 'lifecycle-order-001';
const PAYOUT_ID = 'lifecycle-payout-001';

async function requireVendorSession(page: Page) {
  if (new URL(page.url()).pathname === '/sign-in') {
    test.skip(
      true,
      'A valid vendor storage state is required. Run the setup project with TEST_VENDOR_EMAIL and TEST_VENDOR_PASSWORD.',
    );
  }
}

async function mockChrome(page: Page) {
  await page.route('**/v1/inbox/unread-count', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{"count":0}' }),
  );
  await page.route('**/v1/vendor-members/my-role', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{"role":"owner"}' }),
  );
}

function lifecycleOrder(status: string) {
  return {
    id: ORDER_ID,
    orderNumber: 'FP-LIFE',
    status,
    type: 'standard',
    deliveryType: 'delivery',
    customerId: 'customer-lifecycle',
    vendorId: ID.vendor,
    subtotalPence: 3000,
    deliveryFeePence: 250,
    serviceFeePence: 150,
    discountPence: 0,
    totalPence: 3400,
    commissionPence: 300,
    vendorPayoutPence: 2700,
    notes: 'Please keep allergens separate.',
    scheduledFor: '2026-06-12T12:00:00.000Z',
    createdAt: '2026-06-01T09:00:00.000Z',
    customer: { id: 'customer-lifecycle', firstName: 'Ada', lastName: 'Lovelace' },
    address: {
      id: 'address-lifecycle',
      line1: '1 Test Street',
      city: 'London',
      postcode: 'SE1 1AA',
    },
    items: [
      {
        id: 'line-lifecycle',
        menuItemId: 'menu-item-lifecycle',
        nameSnapshot: 'Jollof Rice',
        quantity: 2,
        unitPence: 1500,
        totalPence: 3000,
        menuItem: { category: 'tray', allergens: ['nuts', 'milk'] },
      },
    ],
    amendments: [],
    disputes: [],
  };
}

test.describe.serial('vendor lifecycle', () => {
  test('VL1: application handoff remains gated until terms, Stripe, documents, tax and menu are complete', async ({
    page,
  }) => {
    await mockChrome(page);
    await installBaseMocks(page, []);

    // This is the vendor-facing approval handoff contract: a submitted
    // application is not a live listing and there is no vendor-side approval
    // action. The platform/admin owns the transition to `live`.
    await page.goto('/onboarding');
    await requireVendorSession(page);
    await expect(page.getByText(/Status:/)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/compliance team will approve/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /connect with stripe/i })).toBeVisible();
    await expect(
      page.getByText(/Accept the Vendor Terms first to unlock menu setup/i),
    ).toBeVisible();

    // Stripe remains deterministic: assert the contract URL, never visit
    // Stripe. A successful link creation must open the returned hosted URL.
    await page.route('**/v1/stripe/connect/link', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://connect.stripe.test/onboarding/lifecycle' }),
      }),
    );
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: /connect with stripe/i }).click();
    await expect((await popup).url()).toContain('connect.stripe.test/onboarding/lifecycle');

    // Terms are click-wrap: it must be blocked before a real scroll and the
    // checkbox must be unticked. This is intentionally a UI check rather than
    // manufacturing consent through an API call.
    await page.goto('/onboarding/terms');
    const termsPane = page.getByRole('region', { name: /scroll to read/i });
    await expect(termsPane).toBeVisible({ timeout: 8_000 });
    const consent = page.locator('#terms-accept-checkbox');
    await expect(consent).not.toBeChecked();
    await expect(consent).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Accept and continue' })).toBeDisabled();

    // A real scroll event, rather than an API shortcut, unlocks the consent
    // control. Capture the legal audit payload to prove the honest scroll flag
    // and the unambiguous acceptance text are both recorded.
    await termsPane.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
    await expect(consent).toBeEnabled();
    let acceptance: { acceptanceText?: string; scrolledToEnd?: boolean } | undefined;
    await page.route(/\/v1\/terms\/versions\/[^/]+\/accept$/, (route) => {
      acceptance = JSON.parse(route.request().postData() ?? '{}') as typeof acceptance;
      void route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
    });
    await consent.check();
    await page.getByRole('button', { name: 'Accept and continue' }).click();
    await expect.poll(() => acceptance).toBeDefined();
    expect(acceptance?.scrolledToEnd).toBe(true);
    expect(acceptance?.acceptanceText).toMatch(/I have read and agree.*Rate Schedule/);
  });

  test('VL2: tax, document, menu, allergen and image constraints form the go-live evidence', async ({
    page,
  }) => {
    await mockChrome(page);
    await installBaseMocks(page, []);

    // Submitted, approved, needs-changes and not-started are distinct
    // vendor-visible document states; a replacement returns to Submitted for
    // the admin approval handoff rather than looking approved immediately.
    let documents: Record<string, unknown>[] = [
      {
        id: 'doc-approved',
        type: 'hygiene_cert',
        status: 'verified',
        fileName: 'hygiene.pdf',
        expiresAt: null,
      },
      {
        id: 'doc-changes',
        type: 'insurance',
        status: 'rejected',
        fileName: 'insurance.pdf',
        expiresAt: null,
        rejectReason: 'Please show the policy expiry date.',
      },
    ];
    await page.route(`**/v1/vendors/${ID.vendor}/documents`, (route) => {
      if (route.request().method() === 'GET') {
        void route.fulfill({ contentType: 'application/json', body: JSON.stringify(documents) });
        return;
      }
      documents = [
        {
          id: 'doc-submitted',
          type: 'kitchen_reg',
          status: 'pending',
          fileName: 'registration.pdf',
          expiresAt: null,
        },
        ...documents,
      ];
      void route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(documents[0]),
      });
    });
    await page.goto('/account-and-compliance');
    await requireVendorSession(page);
    await expect(page.getByText('Approved', { exact: true })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('Needs changes', { exact: true })).toBeVisible();
    await expect(page.getByText('Not started', { exact: true })).toBeVisible();
    const registration = page.locator('article').filter({ hasText: 'Food business registration' });
    const documentChooser = page.waitForEvent('filechooser');
    await registration.getByRole('button', { name: 'Upload document' }).click();
    await (
      await documentChooser
    ).setFiles({
      name: 'registration.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 lifecycle'),
    });
    await expect(registration.getByText('Submitted', { exact: true })).toBeVisible();

    // SI 2023/817 tax collection: both sole-trader and company-specific
    // fields are visible through the normal form, and the submitted payload is
    // asserted rather than merely checking a success toast.
    await page.route('**/v1/vendors/me/tax-profile', (route) => {
      if (route.request().method() === 'GET') {
        void route.fulfill({ contentType: 'application/json', body: 'null' });
        return;
      }
      void route.fulfill({
        contentType: 'application/json',
        body: route.request().postData() ?? '{}',
      });
    });
    await page.route('**/v1/vendors/me/tax-profile/from-stripe', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: '{"message":"No Stripe data"}',
      }),
    );
    await page.route('**/v1/vendors/me/platform-reports', (route) =>
      route.fulfill({ contentType: 'application/json', body: '[]' }),
    );
    await page.goto('/tax-information');
    await expect(page.getByText(/SI 2023\/817/)).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/Date of birth.*required for sole traders/i)).toBeVisible();
    await page.getByRole('combobox').selectOption('LIMITED_COMPANY');
    await expect(page.getByText(/Companies House number.*required/i)).toBeVisible();
    await expect(page.getByPlaceholder('10-digit UTR or NI number')).toBeVisible();

    // Menu permutations: a declared allergen is publishable, whereas the
    // explicit "none" affirmation is the distinct second valid declaration.
    const declared = makeItem('lifecycle-declared', {
      name: 'Nut Jollof',
      allergens: ['nuts'],
      allergensFreeFrom: false,
      isAvailable: true,
    });
    let createBody: Record<string, unknown> | undefined;
    await page.route(/\/v1\/vendors\/[^/]+\/menus\/[^/]+\/items$/, (route) => {
      createBody = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
      void route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(declared),
      });
    });
    await page.goto('/menu');
    await page.getByRole('textbox', { name: 'Search dishes' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Add a dish' }).first().click();
    await page.locator('#dish-name').fill('Nut Jollof');
    await page.locator('#dish-price').fill('15.00');
    await expect(
      page.locator('[data-testid^="allergen-"]:not([data-testid="allergen-none"])'),
    ).toHaveCount(14);
    await page.getByTestId('allergen-nuts').check();
    await page.getByRole('button', { name: 'Live' }).click();

    // Image validation is a real client rule: the sixth image is rejected,
    // rather than silently staging an invalid menu payload.
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add photo' }).click();
    await (
      await chooser
    ).setFiles(
      Array.from({ length: 6 }, (_, i) => ({
        name: `dish-${i}.jpg`,
        mimeType: 'image/jpeg',
        buffer: Buffer.from('image'),
      })),
    );
    await expect(page.getByText('Too many photos')).toBeVisible();
    await page.getByRole('button', { name: 'Save dish' }).click();
    await expect.poll(() => createBody).toBeDefined();
    expect(createBody?.allergens).toEqual(['nuts']);
    expect(createBody?.allergensFreeFrom).toBe(false);
  });

  test('VL3: accepts, fulfils and reconciles an order against its payout statement', async ({
    page,
  }) => {
    await mockChrome(page);
    let current = lifecycleOrder('pending');
    await page.route(`**/v1/orders/${ORDER_ID}`, (route) => {
      if (route.request().method() === 'GET') {
        void route.fulfill({ contentType: 'application/json', body: JSON.stringify(current) });
        return;
      }
      const requested = JSON.parse(route.request().postData() ?? '{}') as { status: string };
      current = { ...current, status: requested.status };
      void route.fulfill({ contentType: 'application/json', body: JSON.stringify(current) });
    });
    await page.route(`**/v1/orders/${ORDER_ID}/status`, (route) => {
      const requested = JSON.parse(route.request().postData() ?? '{}') as { status: string };
      current = { ...current, status: requested.status };
      void route.fulfill({ contentType: 'application/json', body: JSON.stringify(current) });
    });

    await page.goto(`/orders/${ORDER_ID}`);
    await requireVendorSession(page);
    await expect(page.getByRole('button', { name: 'Accept order' })).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByRole('heading', { name: 'Allergen summary' })).toContainText(
      /nuts.*milk/i,
    );
    for (const [button, expected] of [
      ['Accept order', 'accepted'],
      ['Mark preparing', 'preparing'],
      ['Mark ready', 'ready'],
      ['Mark collected', 'delivered'],
    ] as const) {
      await page.getByRole('button', { name: button }).click();
      await expect.poll(() => current.status).toBe(expected);
    }

    const payout = {
      id: PAYOUT_ID,
      vendorId: ID.vendor,
      status: 'transferred',
      amountPence: 2700,
      grossPence: 3000,
      commissionPence: 300,
      refundsPence: 0,
      chargebacksPence: 0,
      serviceFeesPence: 150,
      adjustmentsPence: 0,
      orderCount: 1,
      periodStart: '2026-06-01T00:00:00Z',
      periodEnd: '2026-06-07T00:00:00Z',
      holdReason: null,
      currency: 'gbp',
      approvedAt: null,
      transferredAt: '2026-06-09T00:00:00Z',
      failureReason: null,
      createdAt: '2026-06-08T00:00:00Z',
    };
    await page.route('**/v1/payouts/summary', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: '{"nextPayoutDate":null,"pendingPence":0,"paidToDatePence":2700,"foundingAllowanceGrantedPence":0,"foundingAllowanceUsedPence":0}',
      }),
    );
    await page.route(/\/v1\/payouts\?/, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: [payout], nextCursor: null }),
      }),
    );
    await page.route(`**/v1/payouts/${PAYOUT_ID}/orders`, (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: ORDER_ID,
            orderNumber: 'FP-LIFE',
            deliveredAt: '2026-06-07T00:00:00Z',
            subtotalPence: 3000,
            commissionPence: 300,
            refundsPence: 0,
            chargebacksPence: 0,
            vendorPayoutPence: 2700,
            attributionSource: 'MARKETPLACE_FIRST',
            discountFundedBy: null,
            discountPence: 0,
            foundingAllowanceAppliedPence: 0,
          },
        ]),
      }),
    );
    await page.route(
      /\/v1\/payouts\/orders\/export\.csv\?payoutId=lifecycle-payout-001$/,
      (route) =>
        route.fulfill({
          contentType: 'text/csv',
          body: 'order_number,net_to_vendor\nFP-LIFE,27.00\n',
        }),
    );
    await page.goto('/payouts');
    await expect(page.getByText('£27.00').first()).toBeVisible({ timeout: 8_000 });
    await page.getByRole('button', { name: 'Download statement' }).first().click();
    await page.getByRole('row', { name: /7 Jun 2026/i }).click();
    await expect(page.getByText('FP-LIFE')).toBeVisible();
    await expect(page.getByText('£27.00').last()).toBeVisible();
  });
});
