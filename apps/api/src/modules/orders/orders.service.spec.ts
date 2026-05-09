import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';

import type { AuthUser } from '../../auth/types';

import {
  ADMIN_TRANSITIONS,
  computeCommission,
  isVendorTransitionAllowed,
  OrdersService,
  VENDOR_TRANSITIONS,
} from './orders.service';

const vendorUser = (id = 'u-vend'): AuthUser => ({ id, email: 'v@x', role: UserRole.vendor });
const adminUser = (): AuthUser => ({ id: 'u-admin', email: 'a@x', role: UserRole.admin });
const customerUser = (id = 'u-cust'): AuthUser => ({ id, email: 'c@x', role: UserRole.customer });

describe('OrdersService — pure helpers', () => {
  describe('computeCommission', () => {
    it('15% (1500 bps) of £100.00', () => {
      expect(computeCommission(10_000, 1500)).toEqual({ commissionPence: 1500, vendorPayoutPence: 8500 });
    });
    it('rounds to nearest pence (banker-style not used; Math.round)', () => {
      // 12345 * 1234 / 10000 = 1523.3...  → round = 1523
      expect(computeCommission(12_345, 1234)).toEqual({ commissionPence: 1523, vendorPayoutPence: 12_345 - 1523 });
    });
    it('zero commission yields full payout', () => {
      expect(computeCommission(5000, 0)).toEqual({ commissionPence: 0, vendorPayoutPence: 5000 });
    });
    it('100% (10000 bps) yields zero payout', () => {
      expect(computeCommission(5000, 10_000)).toEqual({ commissionPence: 5000, vendorPayoutPence: 0 });
    });
  });

  describe('vendor transition matrix', () => {
    it.each([
      [OrderStatus.pending, OrderStatus.accepted, true],
      [OrderStatus.pending, OrderStatus.cancelled, true], // rejection path
      [OrderStatus.accepted, OrderStatus.preparing, true],
      [OrderStatus.preparing, OrderStatus.dispatched, true],
      [OrderStatus.dispatched, OrderStatus.delivered, true],
      [OrderStatus.pending, OrderStatus.delivered, false],
      [OrderStatus.accepted, OrderStatus.dispatched, false],
      [OrderStatus.delivered, OrderStatus.cancelled, false],
      [OrderStatus.preparing, OrderStatus.pending, false],
    ])('vendor %s → %s allowed=%s', (from, to, expected) => {
      expect(isVendorTransitionAllowed(from, to)).toBe(expected);
    });

    it('admin terminal transitions are cancelled and refunded', () => {
      expect(ADMIN_TRANSITIONS.has(OrderStatus.cancelled)).toBe(true);
      expect(ADMIN_TRANSITIONS.has(OrderStatus.refunded)).toBe(true);
      expect(ADMIN_TRANSITIONS.has(OrderStatus.preparing)).toBe(false);
    });

    it('VENDOR_TRANSITIONS does not allow admin-only terminal jumps', () => {
      expect(VENDOR_TRANSITIONS.get(OrderStatus.delivered)).toBeUndefined();
      expect(VENDOR_TRANSITIONS.get(OrderStatus.refunded)).toBeUndefined();
    });
  });
});

describe('OrdersService.updateStatus authorization', () => {
  type Mocked<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K] };
  let repo: Mocked<{
    findByIdWithItems: (id: string) => Promise<unknown>;
    transitionStatus: (id: string, from: OrderStatus, data: unknown) => Promise<boolean>;
    findStripePaymentIntent: (id: string) => Promise<string | null>;
    markPaymentStatus: (pi: string, s: string) => Promise<unknown>;
    byCustomer: (id: string, cust: string) => Promise<unknown>;
    addressOwnedBy: (id: string, cust: string) => Promise<unknown>;
  }>;
  let stripe: Mocked<{
    capture: (pi: string) => Promise<unknown>;
    cancel: (pi: string) => Promise<unknown>;
    refund: (pi: string) => Promise<unknown>;
    retrieve: (pi: string) => Promise<{ status: string }>;
  }>;
  let queue: Mocked<{ add: (name: string, data: unknown, opts?: unknown) => Promise<unknown>; getJob: (id: string) => Promise<unknown> }>;
  let service: OrdersService;

  beforeEach(() => {
    repo = {
      findByIdWithItems: jest.fn().mockResolvedValue({ ok: true }),
      transitionStatus: jest.fn().mockResolvedValue(true),
      findStripePaymentIntent: jest.fn().mockResolvedValue(null),
      markPaymentStatus: jest.fn().mockResolvedValue({}),
      byCustomer: jest.fn(),
      addressOwnedBy: jest.fn(),
    };
    stripe = {
      capture: jest.fn().mockResolvedValue({}),
      cancel: jest.fn().mockResolvedValue({}),
      refund: jest.fn().mockResolvedValue({}),
      retrieve: jest.fn().mockResolvedValue({ status: 'requires_capture' }),
    };
    queue = { add: jest.fn().mockResolvedValue({}), getJob: jest.fn().mockResolvedValue(null) };

    service = new OrdersService(
      {} as never,
      repo as never,
      {} as never,
      stripe as never,
      queue as never,
    );
  });

  const order = (overrides: Partial<{ status: OrderStatus; vendorUserId: string }>) => ({
    id: 'o-1',
    status: overrides.status ?? OrderStatus.pending,
    vendorId: 'v-1',
    customerId: 'cust-1',
    vendor: { id: 'v-1', userId: overrides.vendorUserId ?? 'u-vend' },
    items: [],
  });

  it('rejects no-op same-status update', async () => {
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.accepted }));
    await expect(
      service.updateStatus('o-1', { status: OrderStatus.accepted }, vendorUser()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects illegal vendor transition', async () => {
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.pending }));
    await expect(
      service.updateStatus('o-1', { status: OrderStatus.delivered }, vendorUser()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forbids a non-owning vendor', async () => {
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.pending, vendorUserId: 'someone-else' }));
    await expect(
      service.updateStatus('o-1', { status: OrderStatus.accepted }, vendorUser('u-vend')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids customers from updating status', async () => {
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.pending }));
    await expect(
      service.updateStatus('o-1', { status: OrderStatus.accepted }, customerUser()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('owner vendor can accept and removes the auto_cancel job', async () => {
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.pending }));
    const remove = jest.fn().mockResolvedValue(undefined);
    queue.getJob.mockResolvedValue({ remove });
    await service.updateStatus('o-1', { status: OrderStatus.accepted }, vendorUser());
    expect(queue.getJob).toHaveBeenCalledWith('auto_cancel:o-1');
    expect(remove).toHaveBeenCalled();
    expect(repo.transitionStatus).toHaveBeenCalledWith(
      'o-1',
      OrderStatus.pending,
      expect.objectContaining({ status: OrderStatus.accepted }),
    );
  });

  it('CAS failure aborts the transition without firing side-effects', async () => {
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.dispatched }));
    repo.transitionStatus.mockResolvedValue(false);
    repo.findStripePaymentIntent.mockResolvedValue('pi_should_not_capture');
    await expect(
      service.updateStatus('o-1', { status: OrderStatus.delivered }, vendorUser()),
    ).rejects.toMatchObject({ response: { code: 'STATUS_CHANGED_CONCURRENTLY' } });
    expect(stripe.capture).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('on delivered, captures Stripe PI and enqueues review_trigger with 2h delay', async () => {
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.dispatched }));
    repo.findStripePaymentIntent.mockResolvedValue('pi_123');
    await service.updateStatus('o-1', { status: OrderStatus.delivered }, vendorUser());
    expect(stripe.capture).toHaveBeenCalledWith('pi_123');
    expect(queue.add).toHaveBeenCalledWith(
      'review_trigger',
      { orderId: 'o-1' },
      expect.objectContaining({ delay: 2 * 60 * 60 * 1000, jobId: 'review_trigger:o-1' }),
    );
  });

  it('vendor rejection (pending → cancelled) cancels the Stripe PI and stamps reason', async () => {
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.pending }));
    repo.findStripePaymentIntent.mockResolvedValue('pi_999');
    await service.updateStatus(
      'o-1',
      { status: OrderStatus.cancelled, rejectionReason: 'Out of ingredients' },
      vendorUser(),
    );
    expect(stripe.cancel).toHaveBeenCalledWith('pi_999');
    expect(repo.transitionStatus).toHaveBeenCalledWith(
      'o-1',
      OrderStatus.pending,
      expect.objectContaining({ status: OrderStatus.cancelled, notes: '[REJECTED] Out of ingredients' }),
    );
  });

  it('admin can cancel from any state and Stripe-cancels the PI when not yet delivered', async () => {
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.preparing }));
    repo.findStripePaymentIntent.mockResolvedValue('pi_aaa');
    await service.updateStatus(
      'o-1',
      { status: OrderStatus.cancelled, cancellationReason: 'Customer escalation' },
      adminUser(),
    );
    expect(stripe.cancel).toHaveBeenCalledWith('pi_aaa');
    expect(repo.transitionStatus).toHaveBeenCalledWith(
      'o-1',
      OrderStatus.preparing,
      expect.objectContaining({ status: OrderStatus.cancelled, notes: '[CANCELLED] Customer escalation' }),
    );
  });

  it('admin refund attempts a Stripe refund', async () => {
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.delivered }));
    repo.findStripePaymentIntent.mockResolvedValue('pi_bbb');
    await service.updateStatus(
      'o-1',
      { status: OrderStatus.refunded, cancellationReason: 'Goodwill' },
      adminUser(),
    );
    expect(stripe.refund).toHaveBeenCalledWith('pi_bbb');
  });
});

describe('OrdersService.confirmOrder', () => {
  const baseRepo = () => ({
    byCustomer: jest.fn(),
    findStripePaymentIntent: jest.fn(),
  });
  const baseStripe = () => ({ retrieve: jest.fn() });
  const baseQueue = () => ({ add: jest.fn().mockResolvedValue({}) });

  const make = (overrides?: { repo?: ReturnType<typeof baseRepo>; stripe?: ReturnType<typeof baseStripe>; queue?: ReturnType<typeof baseQueue> }) => {
    const repo = overrides?.repo ?? baseRepo();
    const stripe = overrides?.stripe ?? baseStripe();
    const queue = overrides?.queue ?? baseQueue();
    const svc = new OrdersService({} as never, repo as never, {} as never, stripe as never, queue as never);
    return { svc, repo, stripe, queue };
  };

  it('rejects when no Stripe PI is on record', async () => {
    const { svc, repo } = make();
    repo.byCustomer.mockResolvedValue({ status: OrderStatus.pending, vendorId: 'v-1' });
    repo.findStripePaymentIntent.mockResolvedValue(null);
    await expect(svc.confirmOrder('o-1', 'cust-1')).rejects.toMatchObject({
      response: { code: 'NO_PAYMENT_INTENT' },
    });
  });

  it('rejects when Stripe PI is not yet authorised', async () => {
    const { svc, repo, stripe } = make();
    repo.byCustomer.mockResolvedValue({ status: OrderStatus.pending, vendorId: 'v-1' });
    repo.findStripePaymentIntent.mockResolvedValue('pi_x');
    stripe.retrieve.mockResolvedValue({ status: 'requires_payment_method' });
    await expect(svc.confirmOrder('o-1', 'cust-1')).rejects.toMatchObject({
      response: { code: 'PAYMENT_NOT_AUTHORISED' },
    });
  });

  it('is idempotent: confirms an already-accepted order without re-enqueueing', async () => {
    const { svc, repo, queue } = make();
    repo.byCustomer.mockResolvedValue({ status: OrderStatus.accepted, vendorId: 'v-1' });
    const result = await svc.confirmOrder('o-1', 'cust-1');
    expect(result).toMatchObject({ confirmed: true, alreadyConfirmed: true });
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueues notify_vendor + auto_cancel(15m) on first successful confirm', async () => {
    const { svc, repo, stripe, queue } = make();
    repo.byCustomer.mockResolvedValue({ status: OrderStatus.pending, vendorId: 'v-1' });
    repo.findStripePaymentIntent.mockResolvedValue('pi_ok');
    stripe.retrieve.mockResolvedValue({ status: 'requires_capture' });
    await svc.confirmOrder('o-1', 'cust-1');
    expect(queue.add).toHaveBeenNthCalledWith(1, 'notify_vendor', { vendorId: 'v-1', orderId: 'o-1' });
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      'auto_cancel',
      { orderId: 'o-1' },
      expect.objectContaining({ delay: 15 * 60 * 1000, jobId: 'auto_cancel:o-1' }),
    );
  });
});
