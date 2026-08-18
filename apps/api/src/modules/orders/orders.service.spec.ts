import { shouldWaiveServiceFee } from '@feastpot/config/service-fee';
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
    // Signature: computeCommission(subtotalPence, deliveryFeePence, discountPence,
    //                              discountFundedBy, commissionBps)
    //
    // PLATFORM-funded discount: commission on full subtotal; vendor payout =
    //   subtotal + delivery - commission  (discount absorbed by Feastpot, not vendor)
    // VENDOR-funded discount: commission on discounted subtotal; vendor payout =
    //   subtotal + delivery - discount - commission
    // null fundedBy: treated as PLATFORM (no discount in practice).
    //
    // serviceFeePence is Feastpot revenue and never appears in these calculations.

    it('12% (1200 bps) on £100.00 subtotal, no discount, no delivery → £12 commission, £88 payout', () => {
      expect(computeCommission(10_000, 0, 0, null, 1200)).toEqual({
        commissionPence: 1200,
        vendorPayoutPence: 8800,
      });
    });
    it('12% (1200 bps) on £37.50 subtotal → £4.50 commission, £33 payout', () => {
      expect(computeCommission(3750, 0, 0, null, 1200)).toEqual({
        commissionPence: 450,
        vendorPayoutPence: 3300,
      });
    });
    it('does NOT charge commission on delivery fee - vendor keeps the £3 reimbursement', () => {
      // £20 food + £3 delivery, no discount. 12% of £20 = £2.40.
      // Vendor payout = 2000 + 300 - 240 = 2060 (£20.60).
      expect(computeCommission(2000, 300, 0, null, 1200)).toEqual({
        commissionPence: 240,
        vendorPayoutPence: 2060,
      });
    });
    it('EXCLUDES service fee from vendor payout - only subtotal + delivery in formula', () => {
      // £40 food + £2.49 delivery, no discount. 12% of £40 = £4.80.
      // Vendor payout = 4000 + 249 - 480 = 3769 (£37.69).
      // serviceFeePence is not a param: the function never touches it.
      const subtotal = 4000;
      const delivery = 249;
      const result = computeCommission(subtotal, delivery, 0, null, 1200);
      expect(result).toEqual({ commissionPence: 480, vendorPayoutPence: 3769 });
      expect(result.vendorPayoutPence).toBe(subtotal + delivery - 480);
    });
    it('VENDOR-funded discount: commission on discounted subtotal, discount deducted from payout', () => {
      // £40 food + £2.49 delivery, £5 VENDOR-funded discount.
      // commissionBasis = 4000 - 500 = 3500; 12% = 420.
      // payout = 4000 + 249 - 500 - 420 = 3329 (£33.29).
      const subtotal = 4000;
      const delivery = 249;
      const discount = 500;
      const result = computeCommission(subtotal, delivery, discount, 'VENDOR', 1200);
      expect(result).toEqual({ commissionPence: 420, vendorPayoutPence: 3329 });
      expect(result.vendorPayoutPence).toBe(subtotal + delivery - discount - 420);
    });
    it('PLATFORM-funded discount: commission on FULL subtotal, vendor payout UNCHANGED by discount', () => {
      // £40 food + £2.49 delivery, £5 PLATFORM-funded discount (Feastpot absorbs it).
      // commissionBasis = full 4000; 12% = 480.
      // payout = 4000 + 249 - 480 = 3769 - identical to the no-discount case.
      const subtotal = 4000;
      const delivery = 249;
      const noDiscountResult = computeCommission(subtotal, delivery, 0, null, 1200);
      const platformResult = computeCommission(subtotal, delivery, 500, 'PLATFORM', 1200);
      expect(platformResult).toEqual(noDiscountResult);
      expect(platformResult.vendorPayoutPence).toBe(3769);
    });
    it('PLATFORM-funded discount exceeds commission: vendor still paid in full (Feastpot absorbs excess)', () => {
      // £20 food, £15 PLATFORM promo, 12% commission = £2.40.
      // Feastpot subsidises £15 - £2.40 = £12.60 beyond its commission.
      // Vendor payout = 2000 + 0 - 0 - 240 = 1760 (unchanged by the platform promo).
      const result = computeCommission(2000, 0, 1500, 'PLATFORM', 1200);
      expect(result).toEqual({ commissionPence: 240, vendorPayoutPence: 1760 });
    });
    it('PLATFORM-funded discount on 0%-commission order: vendor paid full subtotal + delivery', () => {
      // VENDOR_REFERRED order: 0% commission. £50 food + £3 delivery, £10 platform promo.
      // Feastpot absorbs the full £10 from margin (no commission to offset it).
      // Vendor payout = 5000 + 300 - 0 - 0 = 5300.
      const result = computeCommission(5000, 300, 1000, 'PLATFORM', 0);
      expect(result).toEqual({ commissionPence: 0, vendorPayoutPence: 5300 });
    });
    it('rounds commission to nearest pence (Math.round)', () => {
      // 12345 * 1234 / 10000 = 1523.3...  → round = 1523
      expect(computeCommission(12_345, 0, 0, null, 1234)).toEqual({
        commissionPence: 1523,
        vendorPayoutPence: 12_345 - 1523,
      });
    });
    it('zero commission yields full payout', () => {
      expect(computeCommission(5000, 0, 0, null, 0)).toEqual({
        commissionPence: 0,
        vendorPayoutPence: 5000,
      });
    });
    it('100% (10000 bps) on subtotal still pays back delivery component', () => {
      // £50 food + £5 delivery at 100% commission on subtotal.
      // Commission = £50; vendor still gets the £5 delivery reimbursement.
      expect(computeCommission(5000, 500, 0, null, 10_000)).toEqual({
        commissionPence: 5000,
        vendorPayoutPence: 500,
      });
    });
  });

  describe('shouldWaiveServiceFee', () => {
    // The four combinations of (membership status) x (attribution source).

    it('non-member + marketplace: fee is NOT waived', () => {
      expect(shouldWaiveServiceFee(false, 'MARKETPLACE_FIRST')).toBe(false);
    });

    it('non-member + vendor-referred: fee is NOT waived', () => {
      expect(shouldWaiveServiceFee(false, 'VENDOR_REFERRED')).toBe(false);
    });

    it('member + marketplace first: fee IS waived', () => {
      expect(shouldWaiveServiceFee(true, 'MARKETPLACE_FIRST')).toBe(true);
    });

    it('member + marketplace repeat: fee IS waived', () => {
      expect(shouldWaiveServiceFee(true, 'MARKETPLACE_REPEAT')).toBe(true);
    });

    it('member + vendor-referred: fee is NOT waived (member pays standard fee via vendor link)', () => {
      expect(shouldWaiveServiceFee(true, 'VENDOR_REFERRED')).toBe(false);
    });

    it('member + null attribution (unknown): fee is NOT waived (conservative - price can only fall)', () => {
      expect(shouldWaiveServiceFee(true, null)).toBe(false);
    });

    it('non-member + null attribution: fee is NOT waived', () => {
      expect(shouldWaiveServiceFee(false, null)).toBe(false);
    });
  });

  describe('computeCommission with founding allowance', () => {
    // The 6th param (allowanceCoveredPence) defaults to 0 so all existing tests
    // above are unaffected. These tests exercise the allowance branch.

    it('allowance fully covers subtotal: £0 commission, full payout', () => {
      // £40 subtotal, £4.80 delivery, 12% rate, £40 of allowance remaining.
      // covered = min(4000, 4000) = 4000; chargeable = 0; commission = £0.
      // Vendor payout = 4000 + 480 - 0 - 0 = 4480.
      expect(computeCommission(4000, 480, 0, null, 1200, 4000)).toEqual({
        commissionPence: 0,
        vendorPayoutPence: 4480,
      });
    });

    it('straddle case: £500 order vs £300 allowance remaining (prompt worked example)', () => {
      // covered = min(50000, 30000) = 30000; chargeable = 20000; rate = 12%.
      // commission = round(20000 * 1200 / 10000) = 2400 (£24).
      // payout = 50000 + 0 - 0 - 2400 = 47600 (£476).
      expect(computeCommission(50_000, 0, 0, null, 1200, 30_000)).toEqual({
        commissionPence: 2400,
        vendorPayoutPence: 47_600,
      });
    });

    it('allowance with VENDOR-funded discount: covered applies to discounted basis', () => {
      // £50 subtotal, £5 VENDOR discount, 10% rate, £30 allowance.
      // commissionBasis = 50000 - 5000 = 45000.
      // covered = min(45000, 30000) = 30000; chargeable = 15000.
      // commission = round(15000 * 1000 / 10000) = 1500.
      // payout = 50000 + 0 - 5000 - 1500 = 43500.
      expect(computeCommission(50_000, 0, 5_000, 'VENDOR', 1000, 30_000)).toEqual({
        commissionPence: 1500,
        vendorPayoutPence: 43_500,
      });
    });

    it('allowance with PLATFORM-funded discount: covered applies to full subtotal', () => {
      // £50 subtotal, £5 PLATFORM discount, 12% rate, £20 allowance.
      // commissionBasis = full 50000 (platform discount, vendor unaffected).
      // covered = min(50000, 20000) = 20000; chargeable = 30000.
      // commission = round(30000 * 1200 / 10000) = 3600.
      // payout = 50000 + 0 - 0 - 3600 = 46400.
      expect(computeCommission(50_000, 0, 5_000, 'PLATFORM', 1200, 20_000)).toEqual({
        commissionPence: 3600,
        vendorPayoutPence: 46_400,
      });
    });

    it('allowance = 0 (exhausted): normal tier rate applies', () => {
      // Same as no-allowance path; covered = 0, full rate.
      expect(computeCommission(10_000, 0, 0, null, 1200, 0)).toEqual({
        commissionPence: 1200,
        vendorPayoutPence: 8800,
      });
    });

    it('VENDOR_REFERRED with allowance 0: zero commission (caller never passes allowance for VR orders)', () => {
      // VENDOR_REFERRED rate = 0 bps; allowance arg = 0 (callers must not pass
      // allowance for VENDOR_REFERRED orders per the domain rule).
      expect(computeCommission(5000, 300, 0, null, 0, 0)).toEqual({
        commissionPence: 0,
        vendorPayoutPence: 5300,
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
  type Mocked<T> = {
    [K in keyof T]: T[K] extends (...a: infer A) => infer R ? jest.Mock<R, A> : T[K];
  };
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
  let queue: Mocked<{
    add: (name: string, data: unknown, opts?: unknown) => Promise<unknown>;
    getJob: (id: string) => Promise<unknown>;
  }>;
  let payments: { createRefund: jest.Mock };
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
    payments = { createRefund: jest.fn().mockResolvedValue({ refund: { id: 're_1' }, split: {} }) };
    service = new OrdersService(
      {} as never,
      repo as never,
      {} as never,
      stripe as never,
      queue as never,
      loyalty as never,
      referrals as never,
      discountCodes as never,
      payments as never,
      inbox as never,
      members as never,
    );
  });

  const order = (overrides: Partial<{ status: OrderStatus; vendorUserId: string; totalPence?: number }>) => ({
    id: 'o-1',
    status: overrides.status ?? OrderStatus.pending,
    vendorId: 'v-1',
    customerId: 'cust-1',
    totalPence: overrides.totalPence ?? 11300,
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
    repo.findByIdWithItems.mockResolvedValue(
      order({ status: OrderStatus.pending, vendorUserId: 'someone-else' }),
    );
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

  it('owner vendor can accept and transitions status correctly', async () => {
    // D3: auto_cancel job removed (dead code - no processor consumed it).
    // Acceptance now just transitions status and enqueues order_accepted notification.
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.pending }));
    await service.updateStatus('o-1', { status: OrderStatus.accepted }, vendorUser());
    expect(queue.getJob).not.toHaveBeenCalledWith('auto_cancel:o-1');
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
      expect.objectContaining({
        status: OrderStatus.cancelled,
        notes: '[CANCELLED] Customer escalation',
      }),
    );
  });

  // D-001: status override to `refunded` must route through PaymentsService.createRefund,
  // never call stripe.refund directly from the override path.
  it('admin override to refunded routes through PaymentsService.createRefund, not stripe.refund', async () => {
    repo.findByIdWithItems.mockResolvedValue(
      order({ status: OrderStatus.delivered, totalPence: 11300 }),
    );
    await service.updateStatus(
      'o-1',
      { status: OrderStatus.refunded, cancellationReason: 'Goodwill' },
      adminUser(),
    );
    // Full ledger path must be called.
    expect(payments.createRefund).toHaveBeenCalledWith(
      { orderId: 'o-1', amountPence: 11300, reason: 'Goodwill' },
      expect.objectContaining({ id: 'u-admin', role: UserRole.admin }),
      'admin-override:o-1',
    );
    // Direct Stripe call must NOT happen from the override path.
    expect(stripe.refund).not.toHaveBeenCalled();
  });

  it('admin override to cancelled does NOT call createRefund or stripe.refund', async () => {
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.preparing }));
    repo.findStripePaymentIntent.mockResolvedValue('pi_cancel');
    await service.updateStatus(
      'o-1',
      { status: OrderStatus.cancelled, cancellationReason: 'Customer escalation' },
      adminUser(),
    );
    // Pure PI cancel - no money moves, no ledger.
    expect(stripe.cancel).toHaveBeenCalledWith('pi_cancel');
    expect(payments.createRefund).not.toHaveBeenCalled();
    expect(stripe.refund).not.toHaveBeenCalled();
  });

  it('admin cancel on already-delivered order does NOT void the PI (food was delivered)', async () => {
    repo.findByIdWithItems.mockResolvedValue(order({ status: OrderStatus.delivered }));
    repo.findStripePaymentIntent.mockResolvedValue('pi_del');
    await service.updateStatus(
      'o-1',
      { status: OrderStatus.cancelled, cancellationReason: 'Post-delivery admin cancel' },
      adminUser(),
    );
    // from=delivered: Stripe PI was already captured; cancelling it would fail.
    expect(stripe.cancel).not.toHaveBeenCalled();
    expect(payments.createRefund).not.toHaveBeenCalled();
  });
});

describe('OrdersService.confirmOrder', () => {
  const baseRepo = () => ({
    byCustomer: jest.fn(),
    findStripePaymentIntent: jest.fn(),
  });
  const baseStripe = () => ({ retrieve: jest.fn() });
  const baseQueue = () => ({ add: jest.fn().mockResolvedValue({}) });

  const make = (overrides?: {
    repo?: ReturnType<typeof baseRepo>;
    stripe?: ReturnType<typeof baseStripe>;
    queue?: ReturnType<typeof baseQueue>;
  }) => {
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

  it('enqueues notify_vendor + customer order_confirmation on first successful confirm', async () => {
    // D3: auto_cancel(15m) job removed (dead code - clause 8 now ties deadline to lead time).
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
    expect(queue.add).toHaveBeenNthCalledWith(
      1,
      'notify_vendor',
      expect.objectContaining({ vendorId: 'v-1', orderId: 'o-1' }),
      undefined,
    );
    expect(queue.add).toHaveBeenNthCalledWith(
      2,
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
    // Confirm no auto_cancel job is enqueued (clause 8 deadline is ops-enforced).
    expect(queue.add).not.toHaveBeenCalledWith('auto_cancel', expect.anything(), expect.anything());
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
    const queue = {
      add: jest.fn().mockResolvedValue({}),
      getJob: jest.fn().mockResolvedValue(null),
    };
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

// ---------------------------------------------------------------------------
// discount_funded_by application-layer guard
// ---------------------------------------------------------------------------

describe('OrdersService.finishCreateOrder discount_funded_by guard', () => {
  // Minimal service instance: all dependencies are stubs because the guard
  // fires before any I/O (before the Stripe PI call and before any DB write).
  const makeSvc = () =>
    new OrdersService(
      {} as never, // prisma
      {} as never, // repo
      {} as never, // commission
      {} as never, // stripe
      {} as never, // queue
      {} as never, // loyalty
      {} as never, // feastpass
      {} as never, // notifications
      {} as never, // attribution
      {} as never, // config
      {} as never, // enforcement
    );

  // Minimal args that reach the guard (discountPence > 0, discountFundedBy null).
  // Fields after the guard are never read, so any value satisfies the types.
  const baseArgs = () => ({
    customerId: 'u-cust',
    dto: { vendorId: 'v-1', items: [], deliveryAddressId: null } as never,
    orderId: 'ord-1',
    orderNumber: 'FP-TEST-001',
    scheduledFor: new Date(),
    deliveryType: DeliveryType.collection,
    byId: null,
    subtotalPence: 1000,
    deliveryFeePence: 0,
    serviceFeePence: 0,
    discountPence: 100,
    totalPence: 900,
    commissionRateId: null,
    commissionRatePercent: { toNumber: () => 0.12 } as never,
    attributionSource: 'MARKETPLACE' as never,
    attributionIsFirstOrder: true,
    discountCodeId: null,
    loyaltyToRedeem: 0,
  });

  it('throws DISCOUNT_FUNDED_BY_REQUIRED when discountPence > 0 and discountFundedBy is null', async () => {
    const svc = makeSvc();
    await expect(
      (svc as never as { finishCreateOrder: (a: unknown) => Promise<unknown> }).finishCreateOrder({
        ...baseArgs(),
        discountFundedBy: null,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('includes the DISCOUNT_FUNDED_BY_REQUIRED code in the error response', async () => {
    const svc = makeSvc();
    const err = await (svc as never as { finishCreateOrder: (a: unknown) => Promise<unknown> })
      .finishCreateOrder({ ...baseArgs(), discountFundedBy: null })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({
      code: 'DISCOUNT_FUNDED_BY_REQUIRED',
    });
  });

  it('does not throw when discountPence is zero and discountFundedBy is null', async () => {
    // Zero discount with null funded-by is valid (no discount applied).
    // The guard must not fire; the eventual Stripe call will fail (no mock),
    // so we expect any error that is NOT a BadRequestException.
    const svc = makeSvc();
    const result = await (svc as never as { finishCreateOrder: (a: unknown) => Promise<unknown> })
      .finishCreateOrder({
        ...baseArgs(),
        discountPence: 0,
        totalPence: 1000,
        discountFundedBy: null,
      })
      .catch((e: unknown) => e);
    expect(result).not.toBeInstanceOf(BadRequestException);
  });

  it('does not throw when discountPence is zero and a funded-by source is set (harmless)', async () => {
    // A zero discount with a funded-by value set is allowed and harmless.
    const svc = makeSvc();
    const result = await (svc as never as { finishCreateOrder: (a: unknown) => Promise<unknown> })
      .finishCreateOrder({
        ...baseArgs(),
        discountPence: 0,
        totalPence: 1000,
        discountFundedBy: 'PLATFORM' as never,
      })
      .catch((e: unknown) => e);
    expect(result).not.toBeInstanceOf(BadRequestException);
  });
});
