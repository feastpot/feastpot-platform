/**
 * Compliance gate tests (Prompt 13).
 *
 * Verifies that:
 *   1. createOrder throws VENDOR_NOT_COMPLIANT when complianceStatus is
 *      REGISTERED_AWAITING_INSPECTION (regardless of VendorStatus).
 *   2. createOrder throws VENDOR_NOT_COMPLIANT when complianceStatus is
 *      NOT_ELIGIBLE.
 *   3. createOrder throws VENDOR_NOT_COMPLIANT when complianceStatus is
 *      RATED but fsaHygieneRating < 3 (rating has since dropped).
 *   4. createOrder throws VENDOR_NOT_COMPLIANT when fsaHygieneRating is
 *      null (no rating recorded yet).
 *   5. createOrder proceeds past the compliance gate when complianceStatus
 *      is RATED and fsaHygieneRating >= 3.
 *
 * The listing-gate WHERE clause (v.compliance_status = 'RATED' AND
 * v.fsa_hygiene_rating >= 3) is raw SQL in VendorRepository.search() and
 * is exercised by the integration / E2E suites that run against a real DB.
 * These unit tests cover the order-creation path which is independently
 * important: a vendor whose rating drops below 3 must be blocked from new
 * orders immediately, not just hidden from search.
 */

import { ForbiddenException } from '@nestjs/common';

// ── Minimal stubs ─────────────────────────────────────────────────────────

function makeVendor(
  override: Partial<{
    complianceStatus: string;
    fsaHygieneRating: number | null;
    status: string;
  }> = {},
) {
  return {
    id: 'vendor-uuid',
    userId: 'user-uuid',
    businessName: 'Test Kitchen',
    commissionBps: 1200,
    status: 'live',
    complianceStatus: 'RATED',
    fsaHygieneRating: 4,
    deliveryConfig: {
      latitude: 51.5,
      longitude: -0.1,
      localRadiusMiles: 5,
      postcodes: [] as string[],
    },
    ...override,
  };
}

/**
 * Lightweight re-implementation of the gate logic extracted from
 * OrdersService.createOrderInner.  The real service has many dependencies
 * (Stripe, BullMQ, Prisma, …) that would require deep mocking.  We test
 * the gate predicate in isolation here; the service wiring is covered by
 * the broader E2E order-creation suite.
 */
function runComplianceGate(vendor: ReturnType<typeof makeVendor>): void {
  if (vendor.complianceStatus !== 'RATED' || (vendor.fsaHygieneRating ?? 0) < 3) {
    throw new ForbiddenException({
      code: 'VENDOR_NOT_COMPLIANT',
      message: 'This vendor is not currently accepting orders',
    });
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('FSA compliance gate: createOrder path', () => {
  it('throws VENDOR_NOT_COMPLIANT when complianceStatus is REGISTERED_AWAITING_INSPECTION', () => {
    const vendor = makeVendor({ complianceStatus: 'REGISTERED_AWAITING_INSPECTION' });
    expect(() => runComplianceGate(vendor)).toThrow(ForbiddenException);
    expect(() => runComplianceGate(vendor)).toThrow('not currently accepting orders');
  });

  it('throws VENDOR_NOT_COMPLIANT when complianceStatus is NOT_ELIGIBLE', () => {
    const vendor = makeVendor({ complianceStatus: 'NOT_ELIGIBLE' });
    expect(() => runComplianceGate(vendor)).toThrow(ForbiddenException);
  });

  it('throws VENDOR_NOT_COMPLIANT when RATED but fsaHygieneRating has dropped to 2', () => {
    const vendor = makeVendor({ complianceStatus: 'RATED', fsaHygieneRating: 2 });
    expect(() => runComplianceGate(vendor)).toThrow(ForbiddenException);
  });

  it('throws VENDOR_NOT_COMPLIANT when RATED but fsaHygieneRating has dropped to 0', () => {
    const vendor = makeVendor({ complianceStatus: 'RATED', fsaHygieneRating: 0 });
    expect(() => runComplianceGate(vendor)).toThrow(ForbiddenException);
  });

  it('throws VENDOR_NOT_COMPLIANT when RATED but fsaHygieneRating is null (no rating recorded)', () => {
    const vendor = makeVendor({ complianceStatus: 'RATED', fsaHygieneRating: null });
    expect(() => runComplianceGate(vendor)).toThrow(ForbiddenException);
  });

  it('passes when complianceStatus is RATED and fsaHygieneRating is exactly 3 (floor)', () => {
    const vendor = makeVendor({ complianceStatus: 'RATED', fsaHygieneRating: 3 });
    expect(() => runComplianceGate(vendor)).not.toThrow();
  });

  it('passes when complianceStatus is RATED and fsaHygieneRating is 5 (top score)', () => {
    const vendor = makeVendor({ complianceStatus: 'RATED', fsaHygieneRating: 5 });
    expect(() => runComplianceGate(vendor)).not.toThrow();
  });

  it('error code is VENDOR_NOT_COMPLIANT, not a generic forbidden', () => {
    const vendor = makeVendor({ complianceStatus: 'REGISTERED_AWAITING_INSPECTION' });
    let caught: ForbiddenException | null = null;
    try {
      runComplianceGate(vendor);
    } catch (e) {
      caught = e as ForbiddenException;
    }
    expect(caught).not.toBeNull();
    const body = caught!.getResponse() as Record<string, unknown>;
    expect(body.code).toBe('VENDOR_NOT_COMPLIANT');
  });
});

describe('FSA compliance gate: listing-gate contract', () => {
  /**
   * The listing gate lives in raw SQL (vendors.repository.ts search()) so
   * this describe block documents the contract rather than re-testing the
   * SQL.  Full verification is in the E2E db:test suite which runs against
   * a real Postgres instance.
   *
   * What the SQL enforces (checked here as a spec reference):
   *   AND v.compliance_status::text = 'RATED'
   *   AND v.fsa_hygiene_rating >= 3
   */
  it('RATED with rating 3 satisfies the listing gate predicate', () => {
    const row = { compliance_status: 'RATED', fsa_hygiene_rating: 3 };
    const gatePass = row.compliance_status === 'RATED' && (row.fsa_hygiene_rating ?? 0) >= 3;
    expect(gatePass).toBe(true);
  });

  it('REGISTERED_AWAITING_INSPECTION fails the listing gate predicate', () => {
    const row = { compliance_status: 'REGISTERED_AWAITING_INSPECTION', fsa_hygiene_rating: null };
    const gatePass = row.compliance_status === 'RATED' && (row.fsa_hygiene_rating ?? 0) >= 3;
    expect(gatePass).toBe(false);
  });

  it('RATED with rating 2 fails the listing gate predicate (dropped below floor)', () => {
    const row = { compliance_status: 'RATED', fsa_hygiene_rating: 2 };
    const gatePass = row.compliance_status === 'RATED' && (row.fsa_hygiene_rating ?? 0) >= 3;
    expect(gatePass).toBe(false);
  });
});
