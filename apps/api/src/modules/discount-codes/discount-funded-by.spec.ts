/**
 * Unit tests proving that the commission formula branches correctly on
 * discount funding source, matching the formula documented in Prompt 18.
 *
 *   PLATFORM-funded: commission basis = full subtotal (vendor paid in full)
 *   VENDOR-funded:   commission basis = subtotal − discount (vendor bears cost)
 *
 * These tests exercise `computeCommission` from orders.service.ts directly ,
 * it is a pure function so no DB or NestJS wiring is needed.
 */

import { computeCommission } from '../orders/orders.service';

const BPS = 800; // Current first-order marketplace rate.

describe('computeCommission , discount funding source', () => {
  const SUBTOTAL = 10_000; // £100
  const DELIVERY = 0;
  const DISCOUNT = 2_000; // £20 off

  describe('PLATFORM-funded discount', () => {
    it('uses the FULL pre-discount subtotal as the commission basis', () => {
      const { commissionPence } = computeCommission(SUBTOTAL, DELIVERY, DISCOUNT, 'PLATFORM', BPS);
      // Basis = 10_000 (full subtotal, vendor not penalised)
      // Commission = round(10_000 * 800 / 10_000) = 800
      expect(commissionPence).toBe(800);
    });

    it('pays the vendor the full subtotal + delivery minus commission only (Feastpot absorbs the discount)', () => {
      const { vendorPayoutPence } = computeCommission(
        SUBTOTAL,
        DELIVERY,
        DISCOUNT,
        'PLATFORM',
        BPS,
      );
      // Payout = subtotal + delivery − vendorDeduction − commission
      //        = 10_000 + 0 − 0 − 800 = 9_200
      // The £20 discount is NOT deducted from the vendor , Feastpot eats it.
      expect(vendorPayoutPence).toBe(9_200);
    });

    it('produces the same result whether discount is 0 or set to PLATFORM', () => {
      const { commissionPence: withDiscount } = computeCommission(
        SUBTOTAL,
        DELIVERY,
        DISCOUNT,
        'PLATFORM',
        BPS,
      );
      const { commissionPence: noDiscount } = computeCommission(SUBTOTAL, DELIVERY, 0, null, BPS);
      // Commission basis is identical in both cases.
      expect(withDiscount).toBe(noDiscount);
    });
  });

  describe('VENDOR-funded discount', () => {
    it('uses the DISCOUNTED subtotal as the commission basis', () => {
      const { commissionPence } = computeCommission(SUBTOTAL, DELIVERY, DISCOUNT, 'VENDOR', BPS);
      // Basis = 10_000 − 2_000 = 8_000 (vendor's real food revenue after their promo)
      // Commission = round(8_000 * 800 / 10_000) = 640
      expect(commissionPence).toBe(640);
    });

    it('deducts the discount from the vendor payout (vendor bears the cost)', () => {
      const { vendorPayoutPence } = computeCommission(SUBTOTAL, DELIVERY, DISCOUNT, 'VENDOR', BPS);
      // Payout = subtotal + delivery − discount (vendor deduction) − commission
      //        = 10_000 + 0 − 2_000 − 640 = 7_360
      expect(vendorPayoutPence).toBe(7_360);
    });

    it('vendor pays more commission on a platform-funded code (smaller basis reduces their fee)', () => {
      const { commissionPence: vendorFunded } = computeCommission(
        SUBTOTAL,
        DELIVERY,
        DISCOUNT,
        'VENDOR',
        BPS,
      );
      const { commissionPence: platformFunded } = computeCommission(
        SUBTOTAL,
        DELIVERY,
        DISCOUNT,
        'PLATFORM',
        BPS,
      );
      // VENDOR-funded → lower basis → lower commission (vendor's discount is painful enough)
      expect(vendorFunded).toBeLessThan(platformFunded);
    });
  });

  describe('edge cases', () => {
    it('does not reduce vendor payout below zero when discount exceeds subtotal (VENDOR)', () => {
      const { vendorPayoutPence } = computeCommission(
        1_000, // £10 subtotal
        0,
        3_000, // £30 discount , larger than the order (capped by checkout but tested defensively)
        'VENDOR',
        BPS,
      );
      expect(vendorPayoutPence).toBeGreaterThanOrEqual(0);
    });

    it('null discountFundedBy with zero discount behaves identically to PLATFORM with zero discount', () => {
      const { commissionPence: nullFunded } = computeCommission(SUBTOTAL, DELIVERY, 0, null, BPS);
      const { commissionPence: platformFunded } = computeCommission(
        SUBTOTAL,
        DELIVERY,
        0,
        'PLATFORM',
        BPS,
      );
      expect(nullFunded).toBe(platformFunded);
    });

    it('with delivery fee, vendor payout includes the delivery portion regardless of funding source', () => {
      const delivery = 500; // £5
      const { vendorPayoutPence } = computeCommission(SUBTOTAL, delivery, 0, 'PLATFORM', BPS);
      // No discount: payout = subtotal + delivery − commission
      // commission = round(10_000 * 800 / 10_000) = 800
      expect(vendorPayoutPence).toBe(SUBTOTAL + delivery - 800);
    });
  });
});
