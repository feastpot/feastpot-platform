import { Prisma, TermsDocumentType } from '@prisma/client';

/** One deterministic effective version, irrespective of stale legacy flags. */
export function currentTermsQuery(documentType: TermsDocumentType, now = new Date()) {
  return {
    where: { documentType, effectiveAt: { lte: now } },
    orderBy: [
      { effectiveAt: 'desc' as const },
      { publishedAt: 'desc' as const },
      { id: 'desc' as const },
    ],
  };
}

/** Raw-search counterpart to currentTermsQuery. No current version fails closed. */
export function currentVendorTermsAcceptanceSql(): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM terms_acceptances acceptance
    WHERE acceptance.vendor_id = v.id
      AND acceptance.terms_version_id = (
        SELECT id FROM terms_versions
        WHERE document_type = 'VENDOR_TERMS' AND effective_at <= CURRENT_TIMESTAMP
        ORDER BY effective_at DESC, published_at DESC, id DESC
        LIMIT 1
      )
  )`;
}

/** Never infer fixture status from a name or email address. */
export const realTermsVendorWhere: Prisma.VendorWhereInput = {
  isSeedData: false,
  publicDemo: false,
  user: { isTestData: false },
};
