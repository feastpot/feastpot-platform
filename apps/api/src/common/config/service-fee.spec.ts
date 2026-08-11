/**
 * Unit tests for computeServiceFeePence.
 *
 * The four canonical cases come directly from the spec and the UK DMCC Act
 * 2024 / CMA guidance context:
 *   - Small basket → proportional low fee (no artificial floor).
 *   - Mid basket → 5% applied directly.
 *   - Exact cap → 5% lands exactly on the cap.
 *   - Large basket → capped at £2.99 (299p).
 *   - Zero basket → £0 (empty-basket guard).
 */
import { computeServiceFeePence } from '@feastpot/config/service-fee';

describe('computeServiceFeePence', () => {
  it('£10.00 (1000p): 5% = 50p', () => {
    expect(computeServiceFeePence(1000)).toBe(50);
  });

  it('£59.80 (5980p): 5% = 299p exactly (at cap)', () => {
    expect(computeServiceFeePence(5980)).toBe(299);
  });

  it('£70.00 (7000p): 5% = 350p, capped to 299p', () => {
    expect(computeServiceFeePence(7000)).toBe(299);
  });

  it('£2.00 (200p): 5% = 10p (no minimum floor)', () => {
    expect(computeServiceFeePence(200)).toBe(10);
  });

  it('£0 (0p): returns 0 (empty-basket guard)', () => {
    expect(computeServiceFeePence(0)).toBe(0);
  });

  it('negative subtotal: returns 0 (safety guard)', () => {
    expect(computeServiceFeePence(-100)).toBe(0);
  });

  it('rounds half-up at the penny (0.5 → 1)', () => {
    // £0.10 (10p): 5% = 0.5p → rounds to 1p
    expect(computeServiceFeePence(10)).toBe(1);
  });

  it('never exceeds capPence regardless of subtotal', () => {
    expect(computeServiceFeePence(1_000_000)).toBe(299);
  });

  it('multi-vendor: each vendor fee is independently capped', () => {
    // Two vendors, each £70 subtotal → each capped at 299p → total 598p
    const vendor1 = computeServiceFeePence(7000);
    const vendor2 = computeServiceFeePence(7000);
    expect(vendor1 + vendor2).toBe(598);
    // Compare to wrong approach: fee on combined 14000p would also be 299p
    expect(vendor1 + vendor2).toBeGreaterThan(computeServiceFeePence(14000));
  });
});

// Verify the legacy aliases still delegate to the same formula so nothing
// that imports from service-fee.ts directly regresses silently.
import { calculateServiceFee, getServiceFeePence } from './service-fee';

describe('calculateServiceFee (legacy alias)', () => {
  it('returns same result as computeServiceFeePence', () => {
    expect(calculateServiceFee(1000)).toBe(computeServiceFeePence(1000));
    expect(calculateServiceFee(7000)).toBe(computeServiceFeePence(7000));
  });
});

describe('getServiceFeePence (legacy alias)', () => {
  it('returns same result as computeServiceFeePence', () => {
    expect(getServiceFeePence(1000)).toBe(computeServiceFeePence(1000));
  });
});
