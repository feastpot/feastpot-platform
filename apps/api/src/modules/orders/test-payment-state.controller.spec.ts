import { NotFoundException } from '@nestjs/common';

import { TestPaymentStateController } from './test-payment-state.controller';

describe('TestPaymentStateController', () => {
  const namespace = 'payment-state-run';
  const prisma = {
    order: { findMany: jest.fn() },
  };
  const controller = new TestPaymentStateController(prisma as never);
  const user = {
    id: 'customer-id',
    email: `tf-${namespace}-c2@test.feastpot.co.uk`,
    role: 'customer' as const,
  };
  const originalNodeEnv = process.env.NODE_ENV;
  const originalNamespace = process.env.TEST_FACTORY_NAMESPACE;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.TEST_FACTORY_NAMESPACE = namespace;
    prisma.order.findMany.mockReset();
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.TEST_FACTORY_NAMESPACE = originalNamespace;
  });

  it('returns only the caller factory customer order/payment state', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'order-id',
        status: 'cancelled',
        subtotalPence: 1000,
        deliveryFeePence: 200,
        serviceFeePence: 50,
        discountPence: 100,
        totalPence: 1150,
        payments: [{ id: 'payment-id', orderId: 'order-id', status: 'cancelled' }],
        disputes: [{ id: 'dispute-id', orderId: 'order-id', status: 'open' }],
      },
    ]);

    await expect(controller.inspect({ user, headers: {} }, namespace)).resolves.toEqual({
      namespace,
      orders: [
        {
          id: 'order-id',
          status: 'cancelled',
          subtotalPence: 1000,
          deliveryFeePence: 200,
          serviceFeePence: 50,
          discountPence: 100,
          totalPence: 1150,
          payments: [{ id: 'payment-id', orderId: 'order-id', status: 'cancelled' }],
          disputes: [{ id: 'dispute-id', orderId: 'order-id', status: 'open' }],
        },
      ],
    });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: user.id } }),
    );
  });

  it.each([
    ['outside test mode', 'production', namespace, user],
    ['wrong namespace', 'test', 'another-safe-namespace', user],
    ['non-factory user', 'test', namespace, { ...user, email: 'customer@example.com' }],
  ])('fails closed %s', async (_name, nodeEnv, requestNamespace, requestUser) => {
    process.env.NODE_ENV = nodeEnv;
    await expect(
      controller.inspect({ user: requestUser, headers: {} }, requestNamespace),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });
});
