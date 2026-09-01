import { existsSync, readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { TestDataFactory, type TestIdentity } from '../../../scripts/test-factory';

import {
  matrixManifestPath,
  matrixNamespace,
  matrixStorageStatePath,
  type VendorStateMatrixManifest,
} from './helpers/vendor-state-matrix';

function readManifest(): VendorStateMatrixManifest {
  const path = matrixManifestPath(matrixNamespace());
  if (!existsSync(path)) throw new Error(`Vendor fixture manifest is missing at ${path}.`);
  return JSON.parse(readFileSync(path, 'utf8')) as VendorStateMatrixManifest;
}

async function accessToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.includes('auth-token')) continue;
      const session = JSON.parse(localStorage.getItem(key) ?? '{}') as { access_token?: string };
      if (session.access_token) return session.access_token;
    }
    return null;
  });
  if (!token) throw new Error('Factory V5 browser session has no access token.');
  return token;
}

async function updateOrder(
  page: Page,
  orderId: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const token = await accessToken(page);
  const url = process.env.TEST_API_URL ?? 'http://localhost:3001';
  return page.evaluate(
    async ({ apiUrl, id, request, accessToken: bearer }) => {
      const response = await fetch(`${apiUrl}/v1/orders/${id}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
    { apiUrl: url, id: orderId, request: body, accessToken: token },
  );
}

test.describe.serial('factory-backed vendor order contracts', () => {
  test.use({ storageState: matrixStorageStatePath('V5') });

  let factory: TestDataFactory;
  let customer: TestIdentity;
  let vendorId: string;
  let menuId: string;
  let itemId: string;
  const orderIds: string[] = [];
  const blackoutIds: string[] = [];

  async function pendingOrder(label: string, createdAt = new Date()) {
    const order = await factory.prisma.order.create({
      data: {
        orderNumber: `TF-${label}-${Date.now()}-${orderIds.length}`,
        customerId: customer.userId,
        vendorId,
        type: 'standard',
        status: 'pending',
        deliveryType: 'collection',
        subtotalPence: 1500,
        totalPence: 1500,
        commissionPence: 150,
        vendorPayoutPence: 1350,
        allergenConfirmed: true,
        scheduledFor: new Date(Date.now() + 48 * 60 * 60 * 1000),
        createdAt,
        items: {
          create: {
            menuItemId: itemId,
            nameSnapshot: 'Factory order contract dish',
            quantity: 1,
            unitPence: 1500,
            totalPence: 1500,
          },
        },
      },
    });
    orderIds.push(order.id);
    return order;
  }

  test.beforeAll(async () => {
    const manifest = readManifest();
    const v5 = manifest.identities.V5;
    if (!v5.vendorId || !v5.menuId) throw new Error('V5 fixture lacks vendor/menu identity.');
    vendorId = v5.vendorId;
    menuId = v5.menuId;
    factory = TestDataFactory.fromEnvironment({
      namespace: `${matrixNamespace()}-order-contracts`,
    });
    customer = await factory.create('C1');
    const item = await factory.prisma.menuItem.create({
      data: {
        vendorId,
        menuId,
        name: 'Factory order contract dish',
        description: 'Temporary dish for real vendor order API checks.',
        category: 'mains',
        pricePence: 1500,
        imageUrls: [],
        allergens: ['milk'],
        tags: ['test-fixture'],
        isAvailable: true,
      },
    });
    itemId = item.id;
  });

  test.afterAll(async () => {
    try {
      if (orderIds.length) {
        await factory.prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
        await factory.prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      }
      if (blackoutIds.length)
        await factory.prisma.blackoutDate.deleteMany({ where: { id: { in: blackoutIds } } });
      if (itemId) await factory.prisma.menuItem.delete({ where: { id: itemId } });
      await factory.teardown(customer);
    } finally {
      await factory.dispose();
    }
  });

  test('reject records the vendor reason and direct fulfilment is rejected', async ({ page }) => {
    await page.goto('/orders', { waitUntil: 'domcontentloaded' });
    const directFulfil = await pendingOrder('DIRECT');
    const directResponse = await updateOrder(page, directFulfil.id, { status: 'delivered' });
    expect(directResponse.status).toBe(400);
    await expect
      .poll(
        async () =>
          (await factory.prisma.order.findUniqueOrThrow({ where: { id: directFulfil.id } })).status,
      )
      .toBe('pending');

    const rejected = await pendingOrder('REJECT');
    const rejectionReason = 'Kitchen cannot safely fulfil the requested allergen separation.';
    const rejectedResponse = await updateOrder(page, rejected.id, {
      status: 'rejected',
      rejectionReason,
    });
    expect(rejectedResponse.status).toBe(200);
    await expect
      .poll(async () =>
        factory.prisma.order.findUniqueOrThrow({
          where: { id: rejected.id },
          select: { status: true, cancellationReason: true, cancelledBy: true },
        }),
      )
      .toMatchObject({
        status: 'rejected',
        cancellationReason: rejectionReason,
        cancelledBy: 'vendor',
      });
  });

  test('no response auto-rejects and a dispatch delay persists an ETA', async ({ page }) => {
    const expired = await pendingOrder('TIMEOUT', new Date(Date.now() - 20 * 60 * 1000));
    await page.goto('/orders', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(
        async () =>
          (await factory.prisma.order.findUniqueOrThrow({ where: { id: expired.id } })).status,
        { timeout: 10_000 },
      )
      .toBe('rejected');

    const delayed = await pendingOrder('DELAY');
    expect((await updateOrder(page, delayed.id, { status: 'accepted' })).status).toBe(200);
    expect((await updateOrder(page, delayed.id, { status: 'preparing' })).status).toBe(200);
    expect(
      (await updateOrder(page, delayed.id, { status: 'dispatched', etaMinutes: 45 })).status,
    ).toBe(200);
    await expect
      .poll(async () =>
        factory.prisma.order.findUniqueOrThrow({
          where: { id: delayed.id },
          select: { status: true, etaMinutes: true, etaAt: true },
        }),
      )
      .toMatchObject({ status: 'dispatched', etaMinutes: 45 });
  });

  test('a slot that becomes unavailable is persisted and the received order is rejected with that reason', async ({
    page,
  }) => {
    const order = await pendingOrder('SLOT-CLOSED');
    const scheduledDate = new Date(order.scheduledFor!);
    const blackout = await factory.prisma.blackoutDate.create({
      data: { vendorId, date: scheduledDate, reason: 'Kitchen capacity unexpectedly unavailable' },
    });
    blackoutIds.push(blackout.id);
    await page.goto('/orders', { waitUntil: 'domcontentloaded' });

    const response = await updateOrder(page, order.id, {
      status: 'rejected',
      rejectionReason: 'slot_became_unavailable',
    });
    expect(response.status).toBe(200);
    await expect
      .poll(async () =>
        factory.prisma.order.findUniqueOrThrow({
          where: { id: order.id },
          select: { status: true, cancellationReason: true },
        }),
      )
      .toMatchObject({ status: 'rejected', cancellationReason: 'slot_became_unavailable' });
    await expect
      .poll(async () =>
        factory.prisma.blackoutDate.findUniqueOrThrow({
          where: { vendorId_date: { vendorId, date: scheduledDate } },
          select: { reason: true },
        }),
      )
      .toMatchObject({ reason: 'Kitchen capacity unexpectedly unavailable' });
  });
});
