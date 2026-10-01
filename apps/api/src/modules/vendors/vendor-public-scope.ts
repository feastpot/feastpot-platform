import { Prisma, VendorStatus } from '@prisma/client';

export const NIGERIAN_DEMO_VENDOR_PROVENANCE = 'nigerian-demo-vendor';

type VendorProvenance = {
  publicDemo?: boolean;
  isSeedData?: boolean;
  user?: { isTestData?: boolean; provenance?: string | null } | null;
};

export function isExplicitPublicDemo(vendor: VendorProvenance): boolean {
  return (
    vendor.publicDemo === true &&
    vendor.isSeedData === false &&
    vendor.user?.isTestData === true &&
    vendor.user.provenance === NIGERIAN_DEMO_VENDOR_PROVENANCE
  );
}

export function isNonOrderableVendor(
  vendor: VendorProvenance,
  nodeEnv = process.env.NODE_ENV,
): boolean {
  return (
    vendor.publicDemo === true ||
    (nodeEnv !== 'test' && (vendor.isSeedData === true || vendor.user?.isTestData === true))
  );
}

/**
 * Normal customer visibility still requires a real live vendor. The only
 * exception is the specifically-provenanced read-only Nigerian demo.
 */
export function publicVendorWhere(
  identity: { id: string } | { slug: string },
): Prisma.VendorWhereInput {
  if (process.env.NODE_ENV === 'test') return identity;

  return {
    ...identity,
    OR: [
      {
        isSeedData: false,
        user: { isTestData: false },
        status: VendorStatus.live,
        approvedAt: { not: null },
        suspendedAt: null,
        complianceStatus: {
          in: ['REGISTERED_AWAITING_INSPECTION', 'RATED'],
        },
        OR: [
          { complianceStatus: 'REGISTERED_AWAITING_INSPECTION' },
          { complianceStatus: 'RATED', fsaHygieneRating: { gte: 3 } },
        ],
      },
      {
        publicDemo: true,
        isSeedData: false,
        user: { isTestData: true, provenance: NIGERIAN_DEMO_VENDOR_PROVENANCE },
        suspendedAt: null,
      },
    ],
  };
}

/** Candidates for operational discovery must never include a public demo. */
export function orderableVendorDiscoveryWhere(): Prisma.VendorWhereInput {
  return {
    publicDemo: false,
    ...(process.env.NODE_ENV === 'test'
      ? {}
      : { isSeedData: false, user: { isTestData: false } }),
  };
}

/** SQL counterpart to isExplicitPublicDemo for raw public-search queries. */
export function explicitPublicDemoSql(
  vendorAlias = 'v',
  ownerAlias = 'owner',
): Prisma.Sql {
  return Prisma.sql`(
    ${Prisma.raw(`${vendorAlias}.public_demo`)} = true
    AND ${Prisma.raw(`${vendorAlias}.is_seed_data`)} = false
    AND ${Prisma.raw(`${ownerAlias}.is_test_data`)} = true
    AND ${Prisma.raw(`${ownerAlias}.provenance`)} = ${NIGERIAN_DEMO_VENDOR_PROVENANCE}
  )`;
}