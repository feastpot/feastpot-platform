import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DeliveryType, OrderStatus, UserRole } from '@prisma/client';

import type { AuthUser } from '../../auth/types';

import {
  ADMIN_TRANSITIONS,
  computeCommission,
  isOutsideLocalDeliveryArea,
  isVendorTransitionAllowed,
  OrdersService,
  VENDOR_TRANSITIONS,
} from './orders.service';

const vendorUser = (id = 'u-vend'): AuthUser => ({ id, email: 'v@x', role: UserRole.vendor });
const adminUser = (): AuthUser => ({ id: 'u-admin', email: 'a@x', role: UserRole.admin });
const customerUser = (id = 'u-cust'): AuthUser => ({ id, email: 'c@x', role: UserRole.customer });

describe('OrdersService - pure helpers', () => {
  describe('computeCommission', () => {
    // Signature: computeCommission(subtotalPence, totalPence, commissionBps, serviceFeePence)
    // Commission is on subtotal (food revenue). Vendor payout =
    //   total − serviceFee − commission
    //   = subtotal + delivery − discount − commission
    // The platform service fee is Feastpot revenue and is NEVER paid to the
    // vendor; the delivery fee IS (vendor-set, vendor-fulfilled).

    it('12% (1200 bps) on £100.00 subtotal, no fees → £12 commission, £88 payout', () => {
      expect(computeCommission(10_000, 10_000, 1200, 0)).toEqual({
        commissionPence: 1200,
        vendorPayoutPence: 8800,
      });
    });
    it('12% (1200 bps) on £37.50 subtotal → £4.50 commission, £33 payout', () => {
      expect(computeCommission(3750, 3750, 1200, 0)).toEqual({
        commissionPence: 450,
        vendorPayoutPence: 3300,
      });
    });
    it('does NOT charge commission on delivery fee - vendor keeps the £3 reimbursement', () => {
      // £20 food + £3 delivery = £23 total, no service fee. 12% of £20 = £2.40.
      // Vendor payout = total (£23) − serviceFee (£0) − commission (£2.40) = £20.60.
      expect(computeCommission(2000, 2300, 1200, 0)).toEqual({
        commissionPence: 240,
        vendorPayoutPence: 2060,
      });
    });
    it('EXCLUDES the platform service fee from the vendor payout (revenue-leak guard)', () => {
      // £40 food + £2.49 delivery + £2.00 service fee = £44.49 total.
      // commission = 12% of £40 = £4.80.
      // CORRECT payout = subtotal + delivery − discount − commission
      //                = 4000 + 249 − 0 − 480 = 3769 (£37.69).
      const subtotal = 4000;
      const delivery = 249;
      const serviceFee = 200;
      const total = subtotal + delivery + serviceFee; // 4449
      const result = computeCommission(subtotal, total, 1200, serviceFee);
      expect(result).toEqual({ commissionPence: 480, vendorPayoutPence: 3769 });
      expect(result.vendorPayoutPence).toBe(subtotal + delivery - 480);
      // The vendor must NOT receive the £2.00 service fee (old leaking formula).
      expect(result.vendorPayoutPence).not.toBe(total - 480); // 3969 was the leak
      expect(total - result.vendorPayoutPence - result.commissionPence).toBe(serviceFee);
    });
    it('service fee + delivery + discount all handled: payout = subtotal + delivery − discount − commission', () => {
      // £40 food + £2.49 delivery + £2.00 service fee − £5.00 discount = £39.49 total.
      // commission = £4.80. payout = 4000 + 249 − 500 − 480 = 3269 (£32.69).
      const subtotal = 4000;
      const delivery = 249;
      const serviceFee = 200;
      const discount = 500;
      const total = subtotal + delivery + serviceFee - discount; // 3949
      const result = computeCommission(subtotal, total, 1200, serviceFee);
      expect(result).toEqual({ commissionPence: 480, vendorPayoutPence: 3269 });
      expect(result.vendorPayoutPence).toBe(subtotal + delivery - discount - 480);
    });
    it('rounds commission to nearest pence (Math.round)', () => {
      // 12345 * 1234 / 10000 = 1523.3...  → round = 1523
      expect(computeCommission(12_345, 12_345, 1234, 0)).toEqual({
        commissionPence: 1523,
        vendorPayoutPence: 12_345 - 1523,
      });
    });
    it('zero commission yields full payout (no service fee)', () => {
      expect(computeCommission(5000, 5000, 0, 0)).toEqual({
        commissionPence: 0,
        vendorPayoutPence: 5000,
      });
    });
    it('100% (10000 bps) on subtotal still pays back delivery component', () => {
      // £50 food + £5 delivery = £55 total at 100% commission on subtotal, no service fee.
      // Commission = £50; vendor still gets the £5 delivery reimbursement.
      expect(computeCommission(5000, 5500, 10_000, 0)).toEqual({
        commissionPence: 5000,
        vendorPayoutPence: 500,
      });
    });
  });

  describe('isOutsideLocalDeliveryArea (geofence gate)', () => {
    // The local radius ONLY constrains local delivery. Nationwide/collection
    // vendors serve any distance, so they must never be flagged "outside" -
    // otherwise valid non-local orders are wrongly rejected.
    it('local vendor outside radius → outside (rejected)', () => {
      expect(isOutsideLocalDeliveryArea(DeliveryType.local, 8, 5)).toBe(true);
    });
    it('local vendor inside radius → in-area (allowed)', () => {
      expect(isOutsideLocalDeliveryArea(DeliveryType.local, 3, 5)).toBe(false);
    });
    it('local vendor exactly at radius → in-area (allowed)', () => {
      expect(isOutsideLocalDeliveryArea(DeliveryType.local, 5, 5)).toBe(false);
    });
    it('nationwide vendor beyond local radius → allowed (radius does not apply)', () => {
      expect(isOutsideLocalDeliveryArea(DeliveryType.nationwide, 250, 5)).toBe(false);
    });
    it('collection vendor beyond local radius → allowed (radius does not apply)', () => {
      expect(isOutsideLocalDeliveryArea(DeliveryType.collection, 250, 5)).toBe(false);
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
  let members: { canActOnVendor: jest.Mock };
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

    const loyalty = {
      creditPoints: jest.fn().mockResolvedValue(0),
      redeemPoints: jest.fn().mockResolvedValue(0),
      linkRedemptionToOrder: jest.fn().mockResolvedValue(undefined),
      refundRedemption: jest.fn().mockResolvedValue(undefined),
    };
    const referrals = { rewardReferral: jest.fn().mockResolvedValue(undefined) };
    const discountCodes = {
      validate: jest.fn(),
      applyToOrder: jest.fn().mockResolvedValue(undefined),
    };
    const inbox = { notify: jest.fn().mockResolvedValue(undefined) };
    members = { canActOnVendor: jest.fn().mockResolvedValue(true) };
    service = new OrdersService(
      {} as never,
      repo as never,
      {} as never,
      stripe as never,
      queue as never,
      loyalty as never,
      referrals as never,
      discountCodes as never,
      {} as never,
      inbox as never,
      members as never,
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
    members.canActOnVendor.mockResolvedValue(false);
    await expect(
      service.updateStatus('o-1', { status: OrderStatus.accepted }, vendorUser('u-vend')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids customers from updating status', async () => {
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.pending }));
    members.canActOnVendor.mockResolvedValue(false);
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

  it('vendor rejection (pending → rejected) cancels the Stripe PI and stamps reason', async () => {
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.pending }));
    repo.findStripePaymentIntent.mockResolvedValue('pi_999');
    await service.updateStatus(
      'o-1',
      { status: OrderStatus.rejected, rejectionReason: 'Out of ingredients' },
      vendorUser(),
    );
    expect(stripe.cancel).toHaveBeenCalledWith('pi_999');
    expect(repo.transitionStatus).toHaveBeenCalledWith(
      'o-1',
      OrderStatus.pending,
      expect.objectContaining({
        status: OrderStatus.rejected,
        cancellationReason: 'Out of ingredients',
        cancelledBy: 'vendor',
      }),
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
    const loyalty = {
      creditPoints: jest.fn().mockResolvedValue(0),
      redeemPoints: jest.fn().mockResolvedValue(0),
      linkRedemptionToOrder: jest.fn().mockResolvedValue(undefined),
      refundRedemption: jest.fn().mockResolvedValue(undefined),
    };
    const referrals = { rewardReferral: jest.fn().mockResolvedValue(undefined) };
    const discountCodes = {
      validate: jest.fn(),
      applyToOrder: jest.fn().mockResolvedValue(undefined),
    };
    const inbox = { notify: jest.fn().mockResolvedValue(undefined) };
    const members = { canActOnVendor: jest.fn().mockResolvedValue(true) };
    const svc = new OrdersService(
      {} as never,
      repo as never,
      {} as never,
      stripe as never,
      queue as never,
      loyalty as never,
      referrals as never,
      discountCodes as never,
      {} as never,
      inbox as never,
      members as never,
    );
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

  it('enqueues notify_vendor + auto_cancel(15m) + customer order_confirmation on first successful confirm', async () => {
    const { svc, repo, stripe, queue } = make();
    repo.byCustomer.mockResolvedValue({
      status: OrderStatus.pending,
      vendorId: 'v-1',
      customerId: 'cust-1',
      orderNumber: 'FP-001',
      totalPence: 4000,
      scheduledFor: null,
      items: [{ nameSnapshot: 'Egusi', quantity: 1, unitPence: 4000 }],
      vendor: { businessName: "Maman's Kitchen" },
    });
    repo.findStripePaymentIntent.mockResolvedValue('pi_ok');
    stripe.retrieve.mockResolvedValue({ status: 'requires_capture' });
    await svc.confirmOrder('o-1', 'cust-1');
    expect(queue.add).toHaveBeenNthCalledWith(1, 'notify_vendor', { vendorId: 'v-1', orderId: 'o-1' }, undefined);
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
      'auto_cancel',
      { orderId: 'o-1' },
      expect.objectContaining({ delay: 15 * 60 * 1000, jobId: 'auto_cancel:o-1' }),
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      3,
      'order_confirmation',
      expect.objectContaining({
        userId: 'cust-1',
        orderId: 'o-1',
        orderNumber: 'FP-001',
        vendorName: "Maman's Kitchen",
        totalPence: 4000,
        items: [{ name: 'Egusi', qty: 1, pricePence: 4000 }],
      }),
      expect.objectContaining({ jobId: 'order_confirmation:o-1' }),
    );
  });
});

describe('OrdersService internal financial field exclusion', () => {
  let repo: { findByIdWithItems: jest.Mock; list: jest.Mock };
  let prisma: {
    vendor: { findUnique: jest.Mock };
    vendorMember: { findFirst: jest.Mock };
  };
  let members: { canActOnVendor: jest.Mock };
  let service: OrdersService;

  const orderRow = () => ({
    id: 'order-123',
    orderNumber: 'FP-123',
    status: OrderStatus.accepted,
    vendorId: 'v-1',
    customerId: 'cust-1',
    subtotalPence: 4000,
    serviceFeePence: 200,
    deliveryFeePence: 300,
    totalPence: 4500,
    commissionPence: 480,
    vendorPayoutPence: 3820,
    items: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });

  beforeEach(() => {
    repo = {
      findByIdWithItems: jest.fn().mockResolvedValue(orderRow()),
      list: jest.fn().mockResolvedValue([orderRow()]),
    };
    prisma = {
      vendor: { findUnique: jest.fn().mockResolvedValue(null) },
      vendorMember: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    members = { canActOnVendor: jest.fn().mockResolvedValue(false) };
    service = new OrdersService(
      prisma as never,
      repo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      members as never,
    );
  });

  it('getById: customer response omits vendorPayoutPence and commissionPence', async () => {
    const response = await service.getById('order-123', customerUser('cust-1'));
    expect(response).not.toHaveProperty('vendorPayoutPence');
    expect(response).not.toHaveProperty('commissionPence');
    // Public fields the customer still needs are preserved.
    expect(response).toHaveProperty('totalPence', 4500);
  });

  it('getById: vendor response still includes both internal fields', async () => {
    members.canActOnVendor.mockResolvedValue(true);
    const response = await service.getById('order-123', vendorUser('u-vend'));
    expect(response).toHaveProperty('vendorPayoutPence', 3820);
    expect(response).toHaveProperty('commissionPence', 480);
  });

  it('getById: admin response still includes both internal fields', async () => {
    const response = await service.getById('order-123', adminUser());
    expect(response).toHaveProperty('vendorPayoutPence', 3820);
    expect(response).toHaveProperty('commissionPence', 480);
  });

  it('list: customer rows omit vendorPayoutPence and commissionPence', async () => {
    const { data } = await service.list(customerUser('cust-1'), {});
    expect(data).toHaveLength(1);
    expect(data[0]).not.toHaveProperty('vendorPayoutPence');
    expect(data[0]).not.toHaveProperty('commissionPence');
  });

  it('list: vendor rows still include both internal fields', async () => {
    prisma.vendor.findUnique.mockResolvedValue({ id: 'v-1' });
    const { data } = await service.list(vendorUser('u-vend'), {});
    expect(data[0]).toHaveProperty('vendorPayoutPence', 3820);
    expect(data[0]).toHaveProperty('commissionPence', 480);
  });

  it('list: admin rows still include both internal fields', async () => {
    const { data } = await service.list(adminUser(), {});
    expect(data[0]).toHaveProperty('vendorPayoutPence', 3820);
    expect(data[0]).toHaveProperty('commissionPence', 480);
  });
});

describe('OrdersService.customerCancel financial exclusion', () => {
  const cancelOrder = () => ({
    id: 'order-123',
    orderNumber: 'FP-123',
    status: OrderStatus.pending,
    vendorId: 'v-1',
    customerId: 'cust-1',
    totalPence: 4500,
    commissionPence: 480,
    vendorPayoutPence: 3820,
    items: [],
    customer: { firstName: 'Ada' },
    vendor: { businessName: "Maman's Kitchen", userId: 'u-vend' },
  });

  const make = () => {
    const repo = {
      findByIdWithItems: jest.fn().mockResolvedValue(cancelOrder()),
      transitionStatus: jest.fn().mockResolvedValue(true),
      findStripePaymentIntent: jest.fn().mockResolvedValue(null),
      markPaymentStatus: jest.fn().mockResolvedValue({}),
    };
    const prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } };
    const stripe = { cancel: jest.fn().mockResolvedValue({}) };
    const queue = { add: jest.fn().mockResolvedValue({}), getJob: jest.fn().mockResolvedValue(null) };
    const loyalty = { refundRedemption: jest.fn().mockResolvedValue(undefined) };
    const svc = new OrdersService(
      prisma as never,
      repo as never,
      {} as never,
      stripe as never,
      queue as never,
      loyalty as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { svc };
  };

  it('customer cancel response omits vendorPayoutPence and commissionPence', async () => {
    const { svc } = make();
    const response = await svc.customerCancel('order-123', 'cust-1', 'Changed my mind');
    expect(response).not.toHaveProperty('vendorPayoutPence');
    expect(response).not.toHaveProperty('commissionPence');
    expect(response).toHaveProperty('totalPence', 4500);
  });
});
