-- D16 (S2): EnquiryStatus needs a sixth state to distinguish enquiries
-- that nobody acted on within the SLA window from enquiries that were
-- actively cancelled by the customer or vendor. Without this, analytics
-- conflates operational failure (vendor unresponsiveness) with normal
-- customer-initiated cancellations.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction — Prisma
-- detects this and applies the statement standalone.
ALTER TYPE "EnquiryStatus" ADD VALUE 'expired';
