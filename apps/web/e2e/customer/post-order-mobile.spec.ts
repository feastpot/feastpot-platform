import { expect, test } from './helpers';
import { mockSession, mockSignin } from '../auth/helpers/supabase-mock';
import { SB } from '../auth/helpers/selectors';

test.describe('post-order and mobile customer permutations', () => {
  test('confirmation and delivered-review pages render order data from authenticated API responses', async ({
    page,
  }) => {
    const session = mockSession();
    await mockSignin(page, session);
    await page.route(SB.user, (route) => route.fulfill({ json: session.user }));
    const order = {
      id: 'order-1',
      orderNumber: 'FP-1001',
      status: 'delivered',
      subtotalPence: 1000,
      deliveryFeePence: 200,
      serviceFeePence: 50,
      discountPence: 0,
      totalPence: 1250,
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
      vendor: { id: 'vendor-1', businessName: 'Fixture Kitchen', slug: 'fixture-kitchen' },
      items: [
        {
          id: 'item-1',
          menuItemId: 'menu-1',
          nameSnapshot: 'Peanut stew',
          quantity: 1,
          unitPence: 1000,
          totalPence: 1000,
          notes: null,
        },
      ],
    };
    await page.route('**/v1/orders/order-1', (route) => route.fulfill({ json: order }));
    await page.goto('/sign-in');
    await page.getByLabel(/email/i).fill('test@example.com');
    await page.locator('input[name="password"]').fill('Password1!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.goto('/orders/order-1/confirmation');
    await expect(page.getByRole('heading', { name: 'Order placed!' })).toBeVisible();
    await expect(page.getByText('#FP-1001')).toBeVisible();
    await expect(page.getByText('£12.50')).toBeVisible();
    await page.goto('/orders/order-1/review');
    await expect(page.getByRole('heading', { name: /leave a review/i })).toBeVisible();
  });

  test('mobile happy-path shell has no horizontal overflow at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const widths = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(widths.scrollWidth).toBe(widths.clientWidth);
  });
});
