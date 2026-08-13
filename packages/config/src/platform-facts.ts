/**
 * PLATFORM_FACTS - single source of truth for every commercial and support
 * fact rendered on the Feastpot site.
 *
 * Rules:
 *   1. No page, component or legal document may hardcode a number or policy
 *      that belongs here. Import and reference this constant instead.
 *   2. Changing a value here changes it everywhere. Changing it in one place
 *      only will cause the consistency test to fail the build.
 *   3. whatsapp: null means the channel is not publicly active. Components
 *      must not render a WhatsApp link when this is null.
 */
export const PLATFORM_FACTS = {
  /**
   * Canonical brand name. Always "Feastpot" (capital F, lowercase p).
   * Import this constant anywhere the brand name appears in copy so a
   * single change here propagates everywhere.
   */
  brandName: 'Feastpot' as const,
  commission: {
    /** First-order commission rate charged on food subtotal (%). */
    marketplaceFirst: 12.0,
    /** Repeat-order commission rate once a vendor has a track record (%). */
    marketplaceRepeat: 10.0,
    /** Commission rate for vendors who referred themselves (%). */
    vendorReferred: 0.0,
    basis: 'food subtotal only',
  },
  attribution: {
    /**
     * Calendar days a vendor's own referral link (fp_ref cookie) marks an
     * order as VENDOR_REFERRED. Must match VENDOR_WINDOW_MS in attribution.service.ts.
     */
    vendorLinkWindowDays: 30,
    /**
     * Calendar days the marketplace-introduction marker (fp_mp_{vendorId} cookie)
     * takes precedence over a vendor referral link. Must match MARKETPLACE_WINDOW_MS
     * in attribution.service.ts.
     */
    marketplaceIntroWindowDays: 90,
  },
  serviceFee: {
    /** Customer-facing service fee charged on each order (%). */
    percent: 5,
    /** Maximum service fee in pence (299p = GBP 2.99). */
    capPence: 299,
  },
  feastPass: {
    /** Monthly FeastPass subscription price in pence. */
    monthlyPence: 399,
    /** Annual FeastPass subscription price in pence. */
    annualPence: 3990,
  },
  foundingOffer: {
    /**
     * Commission-free GMV allowance granted to every new vendor at approval.
     * Prisma requires a literal default on the column; the migration comment
     * names this constant so drift is caught by the spec.
     */
    commissionFreeGmvPence: 200_000, // £2,000
    /**
     * Added to a referrer's allowance when the vendor they referred completes
     * their first marketplace order. Capped at maxTotalCommissionFreeGmvPence.
     */
    referralBonusGmvPence: 25_000, // £250
    /**
     * Hard ceiling: a vendor's foundingAllowanceGrantedPence can never exceed
     * this value, regardless of how many vendors they refer.
     */
    maxTotalCommissionFreeGmvPence: 500_000, // £5,000
  },
  payouts: {
    frequency: 'weekly',
    day: 'Monday',
  },
  support: {
    email: 'support@feastpot.co.uk',
    /** Days support is staffed. Used verbatim in copy. */
    hours: 'Monday to Saturday',
    responseTime: 'within 24 hours',
    /**
     * WhatsApp support number (E.164 format) or null if the channel is not
     * publicly active. Components must conditionally render based on this.
     */
    whatsapp: null as string | null,
  },
  /**
   * Ordered list of requirements every vendor must satisfy before going live.
   * Keep this list in sync with:
   *   - help FAQ "What documents do I need to submit?"
   *   - become-a-vendor requirements section
   *   - vendor-readiness checklist
   *   - legal/vendor-terms compliance section
   */
  vendorRequirements: [
    'UK business or sole trader registration',
    'Food Business Registration with your local authority',
    'FHRS rating of at least 3 out of 5 (4 recommended)',
    'Public liability insurance, minimum GBP 1 million',
    'Level 2 food safety certificate or equivalent',
    'Valid photo ID',
    'UK bank account for Stripe Connect',
  ] as readonly string[],
  contact: {
    /**
     * Email for document review, verification, account closure, and terms
     * queries. Use for all compliance and non-appeal vendor enquiries.
     */
    complianceEmail: 'compliance@feastpot.co.uk',
    /**
     * Email for formal appeals of enforcement actions (vendor terms clause 18.1)
     * and dispute stage-2 reviews. Do NOT use for general compliance enquiries.
     */
    appealsEmail: 'appeals@feastpot.co.uk',
  },
  /** Calendar days vendors have to appeal a dispute or suspension outcome. */
  appealWindowDays: 14,
  /** Days notice Feastpot must give before changing terms (clause 10). */
  termsNoticeDays: 15,
  /** Days notice either party must give to terminate (clause 11). */
  terminationNoticeDays: 30,
  /**
   * Minimum calendar days' written notice Feastpot must give before raising any
   * of its own commission or service-fee rates. Covered rates:
   *   commission.marketplaceFirst, commission.marketplaceRepeat,
   *   commission.vendorReferred, serviceFee.percent, serviceFee.capPence.
   * Changes are never applied retrospectively.
   *
   * This is DISTINCT from:
   *   termsNoticeDays   — general terms-document changes (clause 10)
   *   terminationNoticeDays — account termination (clause 11)
   *
   * Stripe's own card-processing rate is a pass-through cost that Feastpot
   * does not set or mark up. A Stripe rate change is NOT a "fee change"
   * under this promise and does not trigger this notice requirement.
   */
  feeChangeNoticeDays: 30,
} as const;

/** Helper: formats a pence value as GBP string, e.g. 399 -> "3.99". */
export function penceToPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}
