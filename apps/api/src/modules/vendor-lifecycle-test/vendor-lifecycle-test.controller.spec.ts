import { NotFoundException } from '@nestjs/common';

import { VendorLifecycleTestController } from './vendor-lifecycle-test.controller';

describe('VendorLifecycleTestController', () => {
  const namespace = 'vendor-life-run';
  const vendorUser = {
    id: 'vendor-user',
    email: `tf-${namespace}-vendor@test.feastpot.co.uk`,
    role: 'vendor' as const,
  };
  const customerUser = {
    id: 'customer-user',
    email: `tf-${namespace}-customer@test.feastpot.co.uk`,
    role: 'customer' as const,
  };
  const prisma = {
    vendor: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    payout: { findFirst: jest.fn() },
    processedWebhookEvent: { upsert: jest.fn() },
  };
  const orders = { createAndConfirmTestOrder: jest.fn() };
  const payouts = { runWeeklyBatch: jest.fn() };
  const stripeWebhooks = { onAccountUpdated: jest.fn(), onCompleted: jest.fn() };
  const controller = new VendorLifecycleTestController(
    prisma as never,
    orders as never,
    payouts as never,
    stripeWebhooks as never,
  );
  const originalNodeEnv = process.env.NODE_ENV;
  const originalNamespace = process.env.TEST_FACTORY_NAMESPACE;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.TEST_FACTORY_NAMESPACE = namespace;
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.TEST_FACTORY_NAMESPACE = originalNamespace;
  });

  it('injects account.updated through the real processor entry point', async () => {
    prisma.vendor.findUnique.mockResolvedValue({
      id: 'vendor-id',
      stripeAccountId: 'acct_factory',
    });
    prisma.vendor.findUniqueOrThrow.mockResolvedValue({
      id: 'vendor-id',
      payoutsEnabled: true,
    });
    prisma.processedWebhookEvent.upsert.mockResolvedValue({ id: 'claim-id' });
    const body = {
      eventId: 'evt_factory',
      created: 1_700_000_000,
      account: { id: 'acct_factory', charges_enabled: true, payouts_enabled: true },
    };

    await expect(
      controller.accountUpdated({ user: vendorUser, headers: {} }, namespace, body as never),
    ).resolves.toMatchObject({ id: 'vendor-id', payoutsEnabled: true });
    expect(stripeWebhooks.onAccountUpdated).toHaveBeenCalledTimes(1);
    expect(stripeWebhooks.onCompleted).toHaveBeenCalledTimes(1);
  });

  it('creates and confirms only an order for a namespace vendor', async () => {
    prisma.vendor.findUnique.mockResolvedValue({ user: { email: vendorUser.email } });
    orders.createAndConfirmTestOrder.mockResolvedValue({
      orderId: 'order-id',
      confirmed: true,
    });
    const dto = {
      vendorId: 'vendor-id',
      items: [{ menuItemId: 'item-id', quantity: 1 }],
      scheduledFor: '2030-01-01T12:00:00.000Z',
    };

    await expect(
      controller.createOrder({ user: customerUser, headers: {} }, namespace, dto as never),
    ).resolves.toMatchObject({ orderId: 'order-id', confirmed: true });
    expect(orders.createAndConfirmTestOrder).toHaveBeenCalledWith(customerUser.id, dto);
  });

  it('runs the batch synchronously and returns the persisted statement identity', async () => {
    prisma.vendor.findUnique.mockResolvedValue({ id: 'vendor-id' });
    payouts.runWeeklyBatch.mockResolvedValue({ created: [{ payoutId: 'payout-id' }] });
    prisma.payout.findFirst.mockResolvedValue({
      id: 'payout-id',
      vendorId: 'vendor-id',
      periodStart: new Date('2030-01-07T00:00:00Z'),
      periodEnd: new Date('2030-01-14T00:00:00Z'),
    });

    await expect(
      controller.weeklyBatch({ user: vendorUser, headers: {} }, namespace, {
        now: '2030-01-15T00:00:00Z',
      }),
    ).resolves.toMatchObject({ id: 'payout-id', vendorId: 'vendor-id' });
    expect(payouts.runWeeklyBatch).toHaveBeenCalledWith(new Date('2030-01-15T00:00:00Z'));
  });

  it.each([
    ['production process', 'production', namespace, vendorUser],
    ['wrong namespace', 'test', 'another-namespace', vendorUser],
    ['unsafe namespace', 'test', 'bad!', vendorUser],
    ['non-factory actor', 'test', namespace, { ...vendorUser, email: 'vendor@example.com' }],
    ['anonymous actor', 'test', namespace, null],
  ])('returns 404 for %s', async (_label, nodeEnv, header, user) => {
    process.env.NODE_ENV = nodeEnv;
    await expect(
      controller.weeklyBatch({ user, headers: {} } as never, header, {}),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(payouts.runWeeklyBatch).not.toHaveBeenCalled();
  });
});
