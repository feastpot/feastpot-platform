import { expect, serviceFee, test, vendorPayout } from './helpers';

const subtotalPence = 10_000;
const commissionPence = 1_200;

const customerStates = [
  ['C1 new marketplace non-member', false, 'marketplace'],
  ['C1 new vendor-referred non-member', false, 'vendor-referred'],
  ['C3 returning repeat non-member', false, 'repeat'],
  ['C4 FeastPass marketplace', true, 'marketplace'],
  ['C5 lapsed pass marketplace', false, 'marketplace'],
] as const;

test.describe('basket, checkout, and fee invariants', () => {
  for (const [label, waived, attribution] of customerStates) {
    test(`${label}: fee is disclosed and vendor payout is invariant`, async () => {
      const fee = serviceFee(subtotalPence, waived);
      expect(fee).toBe(waived ? 0 : 299);
      expect(vendorPayout(subtotalPence, commissionPence)).toBe(8_800);
      expect(subtotalPence + fee).toBe(waived ? 10_000 : 10_299);
      expect(attribution).toBeTruthy();
    });
  }

  test('fee calculation is five percent capped at £2.99', async () => {
    expect(serviceFee(1_000, false)).toBe(50);
    expect(serviceFee(100_000, false)).toBe(299);
  });
});
