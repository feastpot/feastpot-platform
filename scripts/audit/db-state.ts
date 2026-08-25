/**
 * Audit: query current database state.
 * Run: npx ts-node --project tsconfig.json --transpile-only scripts/audit/db-state.ts
 */
import {
  PrismaClient,
  UserStatus,
  VendorStatus,
  VendorComplianceStatus,
  VerificationState,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [
    usersByRole,
    usersByStatus,
    vendorsByStatus,
    vendorsByCompliance,
    orderCount,
    appCount,
    auditCount,
    verificationsByState,
    discountCount,
    memberCount,
    feastpassCount,
    attributionBySource,
    ordersByType,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ['role'], _count: true }),
    prisma.user.groupBy({ by: ['status'], _count: true }),
    prisma.vendor.groupBy({ by: ['status'], _count: true }),
    prisma.vendor.groupBy({ by: ['complianceStatus'], _count: true }),
    prisma.order.count(),
    prisma.vendorApplication.count(),
    prisma.auditLog.count(),
    prisma.vendorVerification.groupBy({ by: ['overallState'], _count: true }),
    prisma.discountCode.count(),
    prisma.vendorMember.count(),
    prisma.feastPassSubscription.count(),
    prisma.orderAttribution.groupBy({ by: ['resolvedSource'], _count: true }),
    prisma.order.groupBy({ by: ['type', 'status'], _count: true }),
  ]);

  console.log('=== DB STATE AUDIT ===');
  console.log(
    'USERS BY ROLE:',
    JSON.stringify(usersByRole.map((r) => ({ role: r.role, count: r._count }))),
  );
  console.log(
    'USERS BY STATUS:',
    JSON.stringify(usersByStatus.map((r) => ({ status: r.status, count: r._count }))),
  );
  console.log(
    'VENDORS BY STATUS:',
    JSON.stringify(vendorsByStatus.map((r) => ({ status: r.status, count: r._count }))),
  );
  console.log(
    'VENDORS BY COMPLIANCE:',
    JSON.stringify(
      vendorsByCompliance.map((r) => ({ compliance: r.complianceStatus, count: r._count })),
    ),
  );
  console.log('ORDERS TOTAL:', orderCount);
  console.log(
    'ORDERS BY TYPE+STATUS:',
    JSON.stringify(ordersByType.map((r) => ({ type: r.type, status: r.status, count: r._count }))),
  );
  console.log('VENDOR APPLICATIONS:', appCount);
  console.log('AUDIT LOGS:', auditCount);
  console.log(
    'VERIFICATIONS BY STATE:',
    JSON.stringify(verificationsByState.map((r) => ({ state: r.overallState, count: r._count }))),
  );
  console.log('DISCOUNT CODES:', discountCount);
  console.log('VENDOR MEMBERS:', memberCount);
  console.log('FEASTPASS SUBSCRIPTIONS:', feastpassCount);
  console.log(
    'ORDER ATTRIBUTION BY SOURCE:',
    JSON.stringify(attributionBySource.map((r) => ({ source: r.resolvedSource, count: r._count }))),
  );

  // Check founding allowance coverage
  const foundingStats = await prisma.vendor.aggregate({
    _count: { _all: true },
    where: { status: VendorStatus.live },
  });
  const exhausted = await prisma.vendor.count({
    where: { status: VendorStatus.live, foundingAllowanceUsedPence: { gte: 200000 } },
  });
  const partial = await prisma.vendor.count({
    where: { status: VendorStatus.live, foundingAllowanceUsedPence: { gt: 0, lt: 200000 } },
  });
  console.log('LIVE VENDORS:', foundingStats._count._all);
  console.log('FOUNDING ALLOWANCE EXHAUSTED:', exhausted);
  console.log('FOUNDING ALLOWANCE PARTIAL:', partial);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
