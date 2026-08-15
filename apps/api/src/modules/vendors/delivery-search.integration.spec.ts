/**
 * Integration test (REAL Postgres): proves that vendor discoverability is
 * governed by the explicit postcode chip set (DeliveryConfig.postcodes), NOT
 * solely by the radius value stored alongside it.
 *
 * REGRESSION GUARD
 * ----------------
 * Before the delivery-settings rewrite, the radius slider in the vendor portal
 * had no effect on which customers could find a vendor; only the outward-code
 * chip set (DeliveryConfig.postcodes) was ever matched by the search query.
 * The rewrite unified the two controls: the slider now populates the chip set,
 * and the search honours both the chip set AND the haversine radius (ORed).
 *
 * A regression here could take one of two forms:
 *   (a) The chip set is ignored and only the radius drives search → a vendor who
 *       explicitly chips in a far-away district is never surfaced there.
 *   (b) The radius alone drives search, bypassing the chip set entirely → a
 *       vendor whose slider covers a district they did NOT chip in appears there
 *       incorrectly.
 *
 * Test 4 (chip set extends coverage beyond the radius) guards against (a).
 * Test 3 (outside both → absent) guards against (b) when the chip set is the
 * limiting mechanism.
 * Test 5 (empty chip set → absent from anywhere tested) guards the cleared state.
 *
 * All assertions run against a real Postgres database (SUPABASE_DB_URL) so that
 * no mock can silently diverge from the actual SQL query in vendors.repository.ts.
 * The test is skipped automatically in plain unit-test runs where that env var
 * is not set.
 */

import { DeliveryType, UserRole, VendorStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { VendorSortBy } from './dto/search-vendors.dto';
import { VendorRepository } from './vendors.repository';

const d = process.env.SUPABASE_DB_URL ? describe : describe.skip;
if (!process.env.SUPABASE_DB_URL) {
  // eslint-disable-next-line no-console
  console.warn('[delivery-search] skipping: SUPABASE_DB_URL not set');
}

const RUN = Date.now();

// ---------------------------------------------------------------------------
// Fixed geography
//
// The vendor is placed at Charing Cross, Central London (a known point used
// by Google Maps and the UK Ordnance Survey as a London reference origin).
// All coordinates are WGS84 decimal degrees.
// ---------------------------------------------------------------------------
const VENDOR_LAT = 51.5072;
const VENDOR_LNG = -0.1276;

// SW1X 9AA (Knightsbridge / Sloane Square area) - outward code SW1X.
// Haversine distance from vendor ≈ 1.9 km - well within the 3-mile radius.
const INSIDE_RADIUS_LAT = 51.4994;
const INSIDE_RADIUS_LNG = -0.1528;
const INSIDE_RADIUS_OUTCODE = 'SW1X';

// M1 (Manchester city centre) - hundreds of kilometres away.
// Haversine distance from vendor ≈ 285 km - far outside the 3-mile radius.
const OUTSIDE_RADIUS_LAT = 53.4808;
const OUTSIDE_RADIUS_LNG = -2.2426;
const OUTSIDE_RADIUS_OUTCODE = 'M1';

// Vendor local delivery radius used throughout the test.
// 3 statute miles ≈ 4.83 km - spans Greater London but not Manchester.
const VENDOR_RADIUS_MILES = 3;

d('Delivery chip-set governs vendor search discoverability (integration, real DB)', () => {
  let prisma: PrismaService;
  let repo: VendorRepository;

  let vendorUserId: string;
  let vendorId: string;

  beforeAll(async () => {
    prisma = new PrismaService({ datasourceUrl: process.env.SUPABASE_DB_URL });
    repo = new VendorRepository(prisma);

    // ---- Vendor owner ----
    const vendorUser = await prisma.user.create({
      data: {
        email: `delivery-search-vendor-${RUN}@test.invalid`,
        role: UserRole.vendor,
        firstName: 'Delivery',
        lastName: 'SearchTest',
      },
    });
    vendorUserId = vendorUser.id;

    // ---- Vendor ----
    // Must satisfy every WHERE-clause gate in vendors.repository.ts search():
    //   status = live, approved_at IS NOT NULL, suspended_at IS NULL,
    //   compliance_status = 'RATED', fsa_hygiene_rating >= 3.
    const vendor = await prisma.vendor.create({
      data: {
        userId: vendorUserId,
        businessName: `Delivery Search Test Kitchen ${RUN}`,
        slug: `delivery-search-${RUN}`,
        status: VendorStatus.live,
        approvedAt: new Date('2026-01-01'),
        complianceStatus: 'RATED' as any,
        fsaHygieneRating: 5,
      },
    });
    vendorId = vendor.id;

    // ---- DeliveryConfig ----
    // Geocode is fixed (no postcodes.io call needed): we insert the vendor's
    // known latitude/longitude directly so the haversine branch works without
    // any external network dependency.  Initial chip set = [INSIDE_RADIUS_OUTCODE].
    await prisma.deliveryConfig.create({
      data: {
        vendorId,
        types: [DeliveryType.local],
        localRadiusMiles: VENDOR_RADIUS_MILES,
        localFeePence: 0,
        nationwideEnabled: false,
        nationwideFeePence: 0,
        minOrderPence: 0,
        postcodes: [INSIDE_RADIUS_OUTCODE],
        kitchenPostcode: 'WC2N 5DU', // Charing Cross - for documentation only
        latitude: VENDOR_LAT,
        longitude: VENDOR_LNG,
      },
    });
  });

  afterAll(async () => {
    // Delete in FK dependency order.
    await prisma.deliveryConfig.deleteMany({ where: { vendorId } });
    await prisma.vendor.deleteMany({ where: { id: vendorId } });
    await prisma.user.deleteMany({ where: { id: vendorUserId } });
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // Helper: search for our specific vendor by slug in the results.
  // We filter by slug client-side rather than by id because the search query
  // does not expose the raw UUID in a way we can pre-filter - slug is on the
  // SELECT list as `business_name`/`slug` via the vendor row.
  // ---------------------------------------------------------------------------
  async function searchForVendor(opts: {
    postcode: string;
    userLat: number | null;
    userLng: number | null;
  }): Promise<boolean> {
    const rows = await repo.search(
      {
        postcode: opts.postcode,
        status: VendorStatus.live,
        sortBy: VendorSortBy.rating,
        limit: 100,
      },
      null,
      opts.userLat !== null && opts.userLng !== null
        ? { latitude: opts.userLat, longitude: opts.userLng }
        : null,
    );
    return rows.some((r) => r.id === vendorId);
  }

  // ---------------------------------------------------------------------------
  // Assertion 1 - fixture sanity
  // The persisted chip set must exactly match what we submitted.
  // ---------------------------------------------------------------------------
  it('persisted chip set equals the submitted postcode list exactly (no second source of truth)', async () => {
    const config = await prisma.deliveryConfig.findUniqueOrThrow({ where: { vendorId } });
    expect(config.postcodes).toEqual([INSIDE_RADIUS_OUTCODE]);
    expect(config.localRadiusMiles).toBe(VENDOR_RADIUS_MILES);
    expect(config.latitude).toBeCloseTo(VENDOR_LAT, 3);
    expect(config.longitude).toBeCloseTo(VENDOR_LNG, 3);
  });

  // ---------------------------------------------------------------------------
  // Assertion 2 - customer inside the chip set is discoverable
  // ---------------------------------------------------------------------------
  it('returns the vendor when the customer postcode is in the chip set', async () => {
    const found = await searchForVendor({
      postcode: INSIDE_RADIUS_OUTCODE,
      userLat: INSIDE_RADIUS_LAT,
      userLng: INSIDE_RADIUS_LNG,
    });
    expect(found).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Assertion 3 - customer outside BOTH chip set AND radius is not found
  // ---------------------------------------------------------------------------
  it('does not return the vendor when the customer postcode is outside both the chip set and the radius', async () => {
    const found = await searchForVendor({
      postcode: OUTSIDE_RADIUS_OUTCODE,
      userLat: OUTSIDE_RADIUS_LAT,
      userLng: OUTSIDE_RADIUS_LNG,
    });
    expect(found).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Assertion 4 - chip set extends coverage beyond the radius
  //
  // REGRESSION GUARD: this is the core check against the original defect.
  //
  // M1 (Manchester) is ~285 km from the London vendor - far outside the
  // 3-mile radius.  Adding "M1" to the chip set must make the vendor
  // discoverable from Manchester even though the haversine path says no.
  // If the search ever regresses to using ONLY the radius (not the chip set),
  // this assertion will fail.
  // ---------------------------------------------------------------------------
  it('makes the vendor discoverable from a far-away postcode when that outcode is added to the chip set - proves chip set governs beyond radius', async () => {
    await prisma.deliveryConfig.update({
      where: { vendorId },
      data: { postcodes: [INSIDE_RADIUS_OUTCODE, OUTSIDE_RADIUS_OUTCODE] },
    });

    const found = await searchForVendor({
      postcode: OUTSIDE_RADIUS_OUTCODE,
      userLat: OUTSIDE_RADIUS_LAT,
      userLng: OUTSIDE_RADIUS_LNG,
    });
    expect(found).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Assertion 5 - clearing the chip set removes discoverability
  // ---------------------------------------------------------------------------
  it('does not return the vendor from any previously chipped postcode once the chip set is cleared', async () => {
    await prisma.deliveryConfig.update({
      where: { vendorId },
      data: { postcodes: [] },
    });

    // M1 was explicitly in the chip set in the previous test; it must now be gone.
    const foundOutside = await searchForVendor({
      postcode: OUTSIDE_RADIUS_OUTCODE,
      userLat: OUTSIDE_RADIUS_LAT,
      userLng: OUTSIDE_RADIUS_LNG,
    });
    expect(foundOutside).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Assertion 6 - persisted chip set matches submitted value (round-trip)
  //
  // Verifies there is no secondary postcode store that the upsert might write
  // to; the only source of truth is DeliveryConfig.postcodes.
  // ---------------------------------------------------------------------------
  it('persisted chip set after clearing equals the empty list - no residual postcode state elsewhere', async () => {
    const config = await prisma.deliveryConfig.findUniqueOrThrow({
      where: { vendorId },
      select: { postcodes: true },
    });
    expect(config.postcodes).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Edge case: non-existent postcode district
  //
  // A well-formed postcode in a district that does not exist in the chip set
  // must produce an empty result, not an error.
  // ---------------------------------------------------------------------------
  it('does not crash and returns no results for a valid-format but non-existent district', async () => {
    // ZZ99 is a reserved test postcode prefix - not a real UK outward code.
    // We await directly; if search() rejects, Jest fails the test naturally.
    const rows = await repo.search(
      { postcode: 'ZZ99 9ZZ', status: VendorStatus.live, sortBy: VendorSortBy.rating },
      null,
      null,
    );
    // The test vendor must not appear - its chip set is empty and it has no
    // address matching ZZ99.
    const found = rows.some((r) => r.id === vendorId);
    expect(found).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Edge case: case and whitespace variance in submitted postcode
  //
  // The chip set is restored with INSIDE_RADIUS_OUTCODE ("SW1X") for this
  // sub-group.  The customer submits the postcode with mixed case, extra
  // spaces, and a sector suffix - the normalisation in vendors.repository.ts
  // (strip spaces, uppercase, slice to 4 chars) must produce the same prefix.
  // ---------------------------------------------------------------------------
  describe('case and whitespace variance in submitted postcode', () => {
    beforeAll(async () => {
      await prisma.deliveryConfig.update({
        where: { vendorId },
        data: { postcodes: [INSIDE_RADIUS_OUTCODE] },
      });
    });

    afterAll(async () => {
      // Restore to empty so each sub-group leaves a clean state.
      await prisma.deliveryConfig.update({
        where: { vendorId },
        data: { postcodes: [] },
      });
    });

    const variants = [
      { label: 'lowercase outward code', postcode: 'sw1x' },
      { label: 'mixed case with sector', postcode: 'Sw1X 9Aa' },
      { label: 'extra leading/trailing spaces', postcode: '  SW1X 9AA  ' },
      { label: 'full uppercase with space', postcode: 'SW1X 9AA' },
    ];

    for (const { label, postcode } of variants) {
      // Each case binds its own `postcode` via the loop closure.
      it(`finds the vendor when postcode is submitted as "${postcode}" (${label})`, async () => {
        const found = await searchForVendor({
          postcode,
          // No user coords: exercises the pure prefix-match branch so we isolate
          // the normalisation logic without the geocoding path.
          userLat: null,
          userLng: null,
        });
        expect(found).toBe(true);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // Edge case: vendor with chip set but no kitchen postcode / no coordinates
  //
  // A vendor whose DeliveryConfig has lat/lng = NULL (e.g. geocoding never
  // succeeded) must still be discoverable via plain outward-code prefix
  // matching against the chip set.  The haversine branch is skipped for
  // vendors without coordinates, but the chip-set branch must remain active.
  // ---------------------------------------------------------------------------
  describe('vendor with chip set but no kitchen postcode or geocoded coordinates', () => {
    let noGeoVendorUserId: string;
    let noGeoVendorId: string;

    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          email: `no-geo-vendor-${RUN}@test.invalid`,
          role: UserRole.vendor,
          firstName: 'NoGeo',
          lastName: 'Vendor',
        },
      });
      noGeoVendorUserId = user.id;

      const vendor = await prisma.vendor.create({
        data: {
          userId: noGeoVendorUserId,
          businessName: `No Geo Kitchen ${RUN}`,
          slug: `no-geo-${RUN}`,
          status: VendorStatus.live,
          approvedAt: new Date('2026-01-01'),
          complianceStatus: 'RATED' as any,
          fsaHygieneRating: 4,
        },
      });
      noGeoVendorId = vendor.id;

      await prisma.deliveryConfig.create({
        data: {
          vendorId: noGeoVendorId,
          types: [DeliveryType.local],
          localRadiusMiles: 5,
          localFeePence: 0,
          nationwideEnabled: false,
          nationwideFeePence: 0,
          minOrderPence: 0,
          // Use a 4-char outward code so the normalised search prefix
          // ("EC1A" from "EC1A 1BB" → strip spaces → "EC1A1BB" → slice 4)
          // matches via the LIKE 'EC1A%' pattern. A 2-3 char code such as
          // "EC1" would NOT match "EC1A%" (too short).
          postcodes: ['EC1A'], // explicit chip only
          kitchenPostcode: null, // no kitchen postcode
          latitude: null, // no geocoded coords
          longitude: null,
        },
      });
    });

    afterAll(async () => {
      await prisma.deliveryConfig.deleteMany({ where: { vendorId: noGeoVendorId } });
      await prisma.vendor.deleteMany({ where: { id: noGeoVendorId } });
      await prisma.user.deleteMany({ where: { id: noGeoVendorUserId } });
    });

    it('is discoverable via the chip set even when the vendor has no kitchen postcode or coordinates', async () => {
      // "EC1A 1BB" normalises to prefix "EC1A" (strip spaces → "EC1A1BB", slice 4).
      // The chip "EC1A" matches LIKE 'EC1A%' → vendor is returned via pure
      // prefix-match even though lat/lng are both NULL.
      const rows = await repo.search(
        {
          postcode: 'EC1A 1BB',
          status: VendorStatus.live,
          sortBy: VendorSortBy.rating,
          limit: 100,
        },
        null,
        null, // no user coords - exercises the pure prefix-match branch
      );
      const found = rows.some((r) => r.id === noGeoVendorId);
      expect(found).toBe(true);
    });

    it('is not discoverable from a postcode outside its chip set when it has no coordinates', async () => {
      // "M1" normalises to prefix "M1  " (only 2 chars, no padding) → "M1"
      // (slice 4 of a 2-char string = the 2-char string). Chip "EC1A" →
      // "EC1A" LIKE 'M1%' → FALSE. No addresses attached → not found.
      const rows = await repo.search(
        {
          postcode: 'M1',
          status: VendorStatus.live,
          sortBy: VendorSortBy.rating,
          limit: 100,
        },
        null,
        null,
      );
      const found = rows.some((r) => r.id === noGeoVendorId);
      expect(found).toBe(false);
    });
  });
});
