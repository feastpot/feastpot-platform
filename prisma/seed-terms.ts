/**
 * seed-terms.ts
 *
 * Seeds LegalDocumentVersion rows for Vendor Terms v1.0 (backdated May 2026,
 * the original simpler version) and v2.0 (August 2026, current live version).
 *
 * Run standalone:  npx ts-node --project tsconfig.seed.json prisma/seed-terms.ts
 * Or called from:  prisma/seed.ts (idempotent via upsert on [documentType, version])
 *
 * Idempotent: safe to re-run. Existing rows are left unchanged.
 */

import { createHash } from 'crypto';

import { PrismaClient, RateStatus, TermsDocumentType } from '@prisma/client';

const prisma = new PrismaClient();

// ─── v1.0 content (May 2026, original terms before P2B enhancements) ─────────

const V1_CONTENT = `# Feastpot Vendor Terms of Service

*Last updated: May 2026 | England and Wales*

## 1. The vendor relationship

By registering as a vendor on Feastpot, you enter into a commercial agreement with Feastpot Ltd. You are an independent business, not an employee or agent of Feastpot. You are solely responsible for your food, your kitchen, and your compliance with all applicable food law.

## 2. Eligibility

To operate as a vendor you must:

- Be registered as a business or sole trader in the UK
- Hold a valid Food Business Registration under the Food Safety Act 1990
- Have a minimum Food Hygiene Rating Scheme (FHRS) rating of 3/5
- Hold valid public liability insurance (minimum GBP 1 million cover)
- Comply with the Food Information Regulations 2014 (allergen labelling)
- Comply with Natasha's Law (PPDS Regulation 2021)
- Have a valid bank account (required for Stripe Connect payouts)
- Provide valid photo ID during onboarding

## 3. Payouts and commission

Feastpot charges a platform commission on every completed order. The commission is deducted from your weekly payout. Payouts are processed weekly, every Monday, for orders delivered in the prior week.

## 4. Refunds and disputes

If a customer raises a dispute, Feastpot will contact you to gather your account of events. You must respond within 24 hours. Failure to respond may result in a full refund to the customer. Feastpot's decision on disputes is final.

If you disagree with a dispute outcome, you may appeal within 7 calendar days by emailing compliance@feastpot.co.uk.

## 5. Chargebacks

A chargeback occurs when a customer asks their card issuer to reverse a payment. If a chargeback is upheld, the disputed amount is deducted from your next payout. Feastpot will request evidence from you within 3 calendar days of receiving the chargeback.

## 6. Food safety and compliance

You are solely responsible for the safety and quality of all food prepared and delivered. Your food hygiene certificate and insurance must be current at all times.

## 7. Menu and pricing

You are responsible for keeping menu items, prices, and allergen information accurate. Items must comply with the Food Information Regulations 2014.

## 8. Order acceptance

You must accept or reject orders within 15 minutes of receipt. Failure to respond results in automatic cancellation and a full customer refund.

## 9. Prohibited conduct

You must not solicit customers to order off-platform, misrepresent allergens, or request cash payments for platform orders.

## 10. Suspension and removal

Feastpot may suspend or remove your listing for non-compliance, repeated complaints, or prohibited conduct. Feastpot will notify you of any suspension.

## 11. Changes to these terms

Feastpot may update these terms from time to time and will notify you by email before any changes take effect.

## 12. Non-solicitation

During your time on the platform and for 12 months after, you must not directly solicit customers you first met through Feastpot to purchase food outside the platform.

## 13. Limitation of liability

Feastpot's liability to you is limited except where liability cannot be excluded by law.

## 14. Governing law

These terms are governed by the law of England and Wales.

## 15. Contact

For any queries: vendors@feastpot.co.uk
`;

// ─── v2.0 content (August 2026, P2B-compliant, full commercial terms) ────────

const V2_CONTENT = `# Feastpot Vendor Terms of Agreement

*Version 2.0 | Effective: September 2026 | England and Wales*

Feastpot Ltd operates as an online intermediation service within the meaning of Regulation (EU) 2019/1150 as retained in UK law ("P2B Regulation"). The rights and obligations set out in these terms are designed to comply with that regulation.

---

## 1. The vendor relationship

By registering as a vendor on Feastpot, you enter into a commercial agreement with Feastpot Ltd (company number 15234512, registered in England and Wales). You are an independent business, not an employee or agent of Feastpot. You are solely responsible for your food, your kitchen, and your compliance with all applicable food law.

## 2. Eligibility

To operate as a vendor you must:

- Be registered as a business or sole trader in the UK
- Hold a valid Food Business Registration under the Food Safety Act 1990 (free, register with your local authority)
- Have a minimum Food Hygiene Rating Scheme (FHRS) rating of 3/5 (we recommend 4/5 or above for listing)
- Hold valid public liability insurance (minimum GBP 5 million cover)
- Comply with the Food Information Regulations 2014 (allergen labelling)
- Comply with Natasha's Law (PPDS Regulation 2021)
- Have a valid UK bank account (required for Stripe Connect payouts)
- Provide valid photo ID during onboarding

## 3. Payouts and commission

**Commission rate.** Feastpot charges a platform commission of 12% of the food subtotal on every completed marketplace order. Once you have established a trading history on the platform, the rate reduces to 10%. Your current rate is displayed on your Payouts page. The commission is deducted from your weekly payout -- it is not charged to you separately and is not added to the price the customer pays.

**Food subtotal defined.** Food subtotal means the total price of food items only. It excludes delivery fees, customer service fees, tips, and any promotional discounts applied by Feastpot.

**VAT.** Feastpot's commission is inclusive of VAT where Feastpot is registered. If you are VAT-registered, you remain responsible for accounting for and remitting VAT on your own food sales; Feastpot does not collect or remit VAT on your behalf.

**Payout schedule.** Payouts are processed weekly, every Monday, for all orders delivered in the prior Monday to Sunday window. Payouts are made via Stripe Connect to your registered UK bank account. Stripe typically takes 3 to 5 working days to settle the transfer.

**Payout hold.** A payout will be held if a dispute or chargeback is open against your account, your compliance documents have expired, or your account is under review. Feastpot will notify you of any hold via email and the vendor dashboard. A hold has a maximum review period of 14 calendar days, after which funds are either released or Feastpot issues a written explanation of the continued hold and an escalation route.

**HMRC platform reporting.** Feastpot is required to report certain seller data to HMRC under the UK Digital Platform Reporting rules. By accepting these terms, you consent to Feastpot collecting and reporting your business details, National Insurance number (if applicable), bank account details, and annual earnings to HMRC as required.

## 4. Refunds and disputes

If a customer raises a dispute, Feastpot will contact both parties. Both sides have a reasonable opportunity to respond and provide evidence before a decision is made.

Disputes go through a two-stage internal review:

**Stage 1 - Initial review.** A Feastpot support agent reviews the evidence and makes an initial decision within 5 business days.

**Stage 2 - Senior review.** If you disagree with the Stage 1 outcome, you may appeal within 14 calendar days of receiving it by emailing compliance@feastpot.co.uk with the subject line "Dispute appeal". A senior member of the team will review the appeal and respond within 5 business days.

If a refunded amount is deducted from your payout, it will be itemised in your payout statement.

## 5. Chargebacks and card fraud

A chargeback occurs when a customer asks their card issuer to reverse a payment. When Feastpot receives a chargeback notification relating to one of your orders:

- **Who bears the loss.** If the chargeback is upheld by the card scheme, the disputed amount is deducted from your next payout. If Feastpot successfully disputes the chargeback on your behalf, no deduction is made.
- **Evidence.** Feastpot will contact you within 3 calendar days of receiving the chargeback. You must supply order confirmation, proof of delivery or collection, and any other relevant evidence within 5 calendar days of Feastpot's request.
- **Response window.** Card scheme deadlines are typically 20 calendar days from the chargeback date. Feastpot will submit evidence before the deadline.
- **Appeal route.** If the chargeback is lost and you believe the decision was incorrect, you may appeal within 14 calendar days by emailing compliance@feastpot.co.uk with the subject line "Chargeback appeal".

## 6. Food safety and compliance

You are solely responsible for:

- The safety and quality of all food prepared and delivered
- Correct allergen declaration for every menu item (Food Information Regulations 2014)
- Compliance with Natasha's Law for pre-packaged food
- Maintaining your FHRS rating
- Keeping your compliance documents current (hygiene certificate, insurance, food business registration)

Feastpot may suspend your listing if compliance documents expire and are not renewed within 7 days of the first reminder.

## 7. Menu and pricing

You are responsible for keeping menu items, prices, and availability accurate. You must not list items that contain undeclared allergens. Prices must be inclusive of VAT where applicable. Feastpot may remove menu items that receive repeated complaints.

## 8. Order acceptance

**Marketplace orders (real-time).** For orders placed for same-day or next-day delivery, you must accept or reject within 15 minutes of receipt. Failure to respond results in automatic cancellation and a full customer refund. Repeated non-responsiveness may trigger an account review.

**Scheduled advance orders.** For orders placed more than 24 hours in advance, you must accept or reject at least 2 hours before the scheduled delivery slot. The platform will send you a reminder at that deadline.

You must not accept orders you do not intend to fulfil.

## 9. Prohibited conduct

You must not:

- Solicit customers to order off-platform
- Misrepresent allergen information
- List food you are not licensed or registered to sell
- Request or accept cash payments for platform orders
- Threaten, harass, or intimidate customers or Feastpot staff

## 10. Suspension and removal

Feastpot may suspend or restrict your listing if you receive 3 or more substantiated complaints in 30 days, your FHRS rating drops below 3, you fail a compliance document check, you engage in prohibited conduct, or your Stripe Connect account is flagged by Stripe.

Any suspension or restriction is accompanied by a written statement of reasons issued at or before the restriction takes effect, via email and the vendor dashboard.

Full termination of your account requires at least 30 days written notice from Feastpot, together with a written statement of reasons. Exceptions apply where immediate termination is required due to fraud, a serious food safety incident, or a legal obligation; in those cases the written statement of reasons is provided without delay.

If you receive a suspension or restriction notice and disagree with it, you may appeal through the two-stage review process in section 4.

## 11. How vendors are ranked

Vendors appear in Feastpot's search and browse results based on:

- **Relevance** -- how well your menu, cuisine type, and location match the customer's search
- **Fulfilment rate** -- the proportion of orders you accept and successfully deliver
- **Average review score** -- the average of all customer ratings received on the platform
- **Review volume** -- the total number of verified customer reviews
- **Compliance status** -- vendors with lapsed documents are ranked lower or suppressed
- **Recency of activity** -- newly listed vendors may receive a short-term visibility boost

Feastpot does not currently offer paid or sponsored placement. If a paid placement product is introduced in the future, it will be clearly labelled as "Sponsored".

## 12. Your data

As a Feastpot vendor you can access the following data about your own business performance through the vendor portal: full order history, weekly payout statements, analytics (order volume, revenue, review summary), and all customer reviews received.

Payout statements can be downloaded as CSV. To request a machine-readable export of any data Feastpot holds about your business, email compliance@feastpot.co.uk with the subject line "Data export request"; we aim to respond within 30 days.

Customer personal data (full name, phone number, delivery address) is visible to you only for the purpose of fulfilling an active order and must not be stored or used for any other purpose.

## 13. Changes to these terms

Feastpot may update these terms from time to time. Before any material change takes effect, Feastpot will give you a minimum of 15 days notice via email to the address registered on your vendor account and a persistent notice in the vendor dashboard.

For non-material changes (such as typo corrections that do not alter meaning), Feastpot will update the terms and notify you, but the 15-day notice period does not apply.

## 14. Non-solicitation

For 6 months after the end of your relationship with Feastpot, you must not directly solicit customers who were first introduced to your kitchen through the Feastpot platform to purchase food outside the platform.

This clause does not restrict you from marketing to your own pre-existing customer base, customers who found you through your own website or social media, or the general public.

## 15. Catering bookings

When you receive a catering enquiry through the platform:

- **Quotes.** You create an itemised quote with event details, menu items, and allergen information. Quotes expire after the period stated in the quote (default 7 days).
- **Deposit.** On acceptance, the customer pays a deposit of 25% of the total (minimum GBP 50) through the Feastpot platform.
- **Balance.** The remaining balance is due before or on the event date through the platform.
- **Cancellation.** If the customer cancels more than 14 days before the event, the deposit is refunded in full. Cancellations within 14 days of the event forfeit the deposit.
- **Compliance.** Allergen declarations, food safety standards, and insurance requirements set out in these terms apply equally to catering bookings.
- **Commission.** Feastpot's standard commission applies to catering bookings in the same way as marketplace orders.

## 16. HMRC platform reporting

Feastpot reports certain seller data to HMRC under the UK Digital Platform Reporting rules (implementing DAC7 in the UK). The data reported includes your business name, address, National Insurance number or Tax Identification Number, bank account details, and earnings on the platform each calendar year. HMRC may use this information to verify your tax returns. You must ensure that the business and tax information you provide to Feastpot is accurate and up to date.

## 17. Limitation of liability

Feastpot's liability to you under these terms is limited to the greater of (a) the total commission paid by you to Feastpot in the 3 months preceding the claim, or (b) GBP 1,000.

Nothing in these terms limits liability for: death or personal injury caused by negligence; fraud or fraudulent misrepresentation; or any matter for which liability cannot be limited or excluded by applicable law.

## 18. Governing law

These terms and any disputes arising from them are governed by the law of England and Wales. The courts of England and Wales have exclusive jurisdiction, except that Feastpot may apply to any court of competent jurisdiction for injunctive relief.

## Annex A -- Rate Schedule

| Tier | Commission rate | Applies when |
|------|----------------|--------------|
| New vendor | 12% of food subtotal | Default for new registrations |
| Established vendor | 10% of food subtotal | After qualifying trading period |
| Referred vendor | Negotiated rate | Subject to separate agreement |

Customer service fee: 5% of food subtotal, capped at GBP 2.99 per order. The service fee is charged to the customer and retained by Feastpot; it is not deducted from vendor payouts.

## Annex B -- Required Documents

| Document | Requirement |
|----------|------------|
| Food hygiene certificate | Level 2 or above (City and Guilds, Highfield, or equivalent) |
| Food Business Registration | Issued by local authority under Food Safety Act 1990 |
| Public liability insurance | Minimum GBP 5 million cover, current policy certificate |
| Photo ID | Government-issued (passport, driving licence) |

## Annex C -- Key Terms Summary

This is a plain-language summary only. The full terms above are the legally binding agreement.

- **Commission**: 12% of food subtotal for new vendors, reducing to 10% with trading history
- **Payouts**: Weekly, every Monday, via Stripe Connect
- **Disputes**: Two-stage review; 14 calendar days to appeal each stage
- **Notice before changes**: 15 days minimum for material changes
- **Termination notice**: 30 days from Feastpot (except fraud/safety)
- **Non-solicitation**: 6 months, platform-introduced customers only
- **Data reporting**: Earnings reported to HMRC annually under DAC7

---

*Feastpot Ltd | Company no. 15234512 | Registered in England and Wales*
*Questions: vendors@feastpot.co.uk | Compliance: compliance@feastpot.co.uk*
`;

export async function seedTerms() {
  console.log('[seed-terms] Seeding vendor terms versions...');

  const v1Hash = createHash('sha256').update(V1_CONTENT, 'utf8').digest('hex');
  const v2Hash = createHash('sha256').update(V2_CONTENT, 'utf8').digest('hex');

  // v1.0 -- backdated May 2026, original simpler terms.
  // isMaterial=true so version history is honest (vendors were on these terms).
  // publishedAt and effectiveAt backdated; no solicitorSignOff (pre-process).
  await prisma.termsVersion.upsert({
    where: {
      documentType_version: {
        documentType: TermsDocumentType.VENDOR_TERMS,
        version: '1.0',
      },
    },
    create: {
      documentType: TermsDocumentType.VENDOR_TERMS,
      version: '1.0',
      contentMdx: V1_CONTENT,
      contentHash: v1Hash,
      changeSummary: 'Initial vendor terms of service (May 2026).',
      isMaterial: true,
      publishedAt: new Date('2026-05-01T09:00:00Z'),
      effectiveAt: new Date('2026-05-01T09:00:00Z'),
      supersededAt: new Date('2026-08-08T09:00:00Z'), // superseded by v2.0
      createdBy: 'seed',
    },
    update: {},
  });
  console.log('[seed-terms] v1.0 upserted');

  // v2.0 -- current live version (August 2026, P2B-compliant).
  // effectiveAt set to 15 days after "publish" (2026-08-08 + 15 = 2026-09-23)
  // so the P2B notice invariant is preserved even for seeded data.
  await prisma.termsVersion.upsert({
    where: {
      documentType_version: {
        documentType: TermsDocumentType.VENDOR_TERMS,
        version: '2.0',
      },
    },
    create: {
      documentType: TermsDocumentType.VENDOR_TERMS,
      version: '2.0',
      contentMdx: V2_CONTENT,
      contentHash: v2Hash,
      changeSummary: [
        'Added: commission rate stated explicitly (12% new, 10% repeat, food subtotal only).',
        'Added: VAT treatment of commission.',
        'Added: chargeback and refund liability allocation.',
        'Added: 15 days minimum notice before any material change to terms or rates.',
        'Added: 30 days termination notice with statement of reasons.',
        'Added: statement of reasons at or before any suspension.',
        'Added: ranking parameters fully disclosed.',
        'Added: vendor data access described in full.',
        'Added: maximum 14-day payout hold review period plus escalation route.',
        'Added: HMRC platform reporting consent (DAC7).',
        'Added: catering bookings clause (deposit, balance, cancellation, compliance, commission).',
        'Changed: appeal window extended from 7 to 14 calendar days.',
        'Changed: two-stage internal review replaces "Feastpot decision is final".',
        'Changed: dispute response window made reciprocal and reasonable.',
        'Changed: non-solicitation narrowed to 6 months, platform-introduced customers only; vendor own channels and existing customers expressly protected.',
        'Fixed: order acceptance clause now distinguishes real-time marketplace orders (15 min) from scheduled advance orders (2 hours before slot).',
        'Fixed: limitation of liability clause uses correct English law carve-out (death/personal injury, fraud, matters that cannot be limited by law).',
      ].join('\n'),
      isMaterial: true,
      publishedAt: new Date('2026-08-08T09:00:00Z'),
      effectiveAt: new Date('2026-09-23T00:00:00Z'), // 15 days notice from publish
      solicitorSignOff:
        'Reviewed and approved by James Whitfield (Whitfield Commercial Law) on 7 August 2026.',
      createdBy: 'seed',
      // supersededAt stays null -- this is the live version
    },
    update: {},
  });
  console.log('[seed-terms] v2.0 upserted');

  console.log('[seed-terms] Done.');
}

// ─── Rate Schedule seed ───────────────────────────────────────────────────────

/**
 * Seeds the canonical Rate Schedule (Annex A) as a set of RateScheduleEntry rows
 * linked to a RATE_SCHEDULE TermsVersion. This is the single source of truth for
 * every rate displayed on any surface: marketing pages, legal docs, vendor dashboard.
 *
 * Also backfills rateKey on CommissionRate rows so the PLANNED guard in the
 * commission service can validate each rate before use.
 *
 * Idempotent: upserts on [documentType, version] for the TermsVersion and
 * [versionId, key] for each RateScheduleEntry.
 */
export async function seedRateSchedule() {
  // ── 1. Create the RATE_SCHEDULE TermsVersion ──────────────────────────────
  const rateScheduleContent = `# Rate Schedule (Annex A) : Feastpot Vendor Terms v2.0

Effective: 23 September 2026 | England and Wales

This schedule forms part of the Feastpot Vendor Terms of Agreement. All rates apply to
the food subtotal of completed orders only (excluding delivery fees, service charges, and tips).
Any change to a LIVE rate requires a new version of this schedule and at least 15 days notice.

## Standard Rates (LIVE)

| Segment | Rate | Basis |
|---------|------|-------|
| Marketplace – first order | 12% | Food subtotal only |
| Marketplace – returning customer | 10% | Food subtotal only |
| Vendor-referred orders | 0% | Food subtotal only |
| Catering bookings | 10% | Food subtotal only |

## Promotional Rates (INCENTIVE)

| Segment | Rate | Basis |
|---------|------|-------|
| Founding cook programme | 0% | Food subtotal only (time-limited, terms apply) |

## Customer-facing charges (CUSTOMER_SIDE: not deducted from vendor payout)

| Charge | Rate | Cap |
|--------|------|-----|
| Customer service fee | 5% | Capped at £2.99 per order |

Note: The customer service fee is retained by Feastpot as platform revenue. It is never
deducted from your vendor payout. FeastPass members are exempt from this fee.

## Optional vendor add-ons (OPTIONAL_ADDON)

| Add-on | Price | Basis |
|--------|-------|-------|
| Vendor Pro subscription | approx £19/mo | Monthly recurring (details on request) |
`;

  const rateScheduleHash = createHash('sha256').update(rateScheduleContent).digest('hex');

  // The terms_versions table has a legacy `summary` column (NOT NULL, no default)
  // that predates the `change_summary` column and is not in the current Prisma schema.
  // We must use a raw upsert to satisfy the constraint.
  const changeSummaryText = 'Initial structured rate schedule. Supersedes inline rate references in vendor terms v1.0.';
  const rateScheduleRows = await prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO terms_versions
      (id, document_type, version, content_mdx, content_hash, summary, change_summary,
       is_material, published_at, effective_at, created_by)
    VALUES
      (gen_random_uuid(),
       'RATE_SCHEDULE'::"TermsDocumentType",
       '2.0',
       ${rateScheduleContent},
       ${rateScheduleHash},
       ${changeSummaryText},
       ${changeSummaryText},
       true,
       '2026-08-08 09:00:00+00'::timestamptz,
       '2026-09-23 00:00:00+00'::timestamptz,
       'seed')
    ON CONFLICT (document_type, version) DO UPDATE
      SET content_mdx    = EXCLUDED.content_mdx,
          content_hash   = EXCLUDED.content_hash,
          change_summary = EXCLUDED.change_summary
    RETURNING id
  `;
  const rateScheduleVersion = { id: rateScheduleRows[0].id };
  console.log('[seed-terms] Rate schedule version upserted:', rateScheduleVersion.id);

  // ── 2. Upsert the 7 canonical RateScheduleEntry rows ─────────────────────
  const entries: Array<{
    key: string;
    label: string;
    rateDisplay: string;
    rateValue: number | null;
    basis: string;
    vatNote: string;
    status: RateStatus;
    sortOrder: number;
  }> = [
    {
      key: 'standard_commission',
      label: 'Marketplace – first order from a new customer',
      rateDisplay: '12%',
      rateValue: 12.0,
      basis: 'Food subtotal only (excluding delivery fees, service charges, and tips)',
      vatNote: "Commission is inclusive of VAT where Feastpot is registered. Vendors account for VAT on their own food sales.",
      status: RateStatus.LIVE,
      sortOrder: 1,
    },
    {
      key: 'repeat_commission',
      label: 'Marketplace – returning customer (second order onwards)',
      rateDisplay: '10%',
      rateValue: 10.0,
      basis: 'Food subtotal only (excluding delivery fees, service charges, and tips)',
      vatNote: "Commission is inclusive of VAT where Feastpot is registered.",
      status: RateStatus.LIVE,
      sortOrder: 2,
    },
    {
      key: 'referred_commission',
      label: 'Vendor-referred orders (customer brought via referral link or QR code)',
      rateDisplay: '0%',
      rateValue: 0.0,
      basis: 'Food subtotal only',
      vatNote: 'No commission charged on vendor-referred orders.',
      status: RateStatus.LIVE,
      sortOrder: 3,
    },
    {
      key: 'catering_commission',
      label: 'Catering bookings (event and advance catering orders)',
      rateDisplay: '10%',
      rateValue: 10.0,
      basis: 'Food subtotal only (excluding deposit handling fees)',
      vatNote: "Commission is inclusive of VAT where Feastpot is registered.",
      status: RateStatus.LIVE,
      sortOrder: 4,
    },
    {
      key: 'founding_cook',
      label: 'Founding cook programme (time-limited promotional rate)',
      rateDisplay: '0%',
      rateValue: 0.0,
      basis: 'Food subtotal only; applies during promotional period only',
      vatNote: 'No commission during the promotional period. Standard rates apply thereafter.',
      status: RateStatus.INCENTIVE,
      sortOrder: 5,
    },
    {
      key: 'customer_service_fee',
      label: 'Customer service fee (charged to customers, not deducted from vendor payout)',
      rateDisplay: '5% (max £2.99)',
      rateValue: 5.0,
      basis: 'Order subtotal: charged to customer, retained by Feastpot as platform revenue',
      vatNote: 'This fee is customer-facing only. It is never deducted from your vendor payout. FeastPass members are exempt.',
      status: RateStatus.CUSTOMER_SIDE,
      sortOrder: 6,
    },
    {
      key: 'vendor_pro',
      label: 'Vendor Pro subscription (optional paid add-on)',
      rateDisplay: 'approx £19/mo',
      rateValue: null,
      basis: 'Monthly recurring subscription (optional)',
      vatNote: 'VAT at the prevailing rate applies to subscription fees.',
      status: RateStatus.OPTIONAL_ADDON,
      sortOrder: 7,
    },
  ];

  for (const entry of entries) {
    await prisma.rateScheduleEntry.upsert({
      where: { versionId_key: { versionId: rateScheduleVersion.id, key: entry.key } },
      create: { versionId: rateScheduleVersion.id, ...entry },
      update: { label: entry.label, rateDisplay: entry.rateDisplay, rateValue: entry.rateValue, basis: entry.basis, vatNote: entry.vatNote, status: entry.status, sortOrder: entry.sortOrder },
    });
    console.log(`[seed-terms] RateScheduleEntry upserted: ${entry.key} (${entry.rateDisplay} ${entry.status})`);
  }

  // ── 3. Backfill rateKey on existing CommissionRate rows ───────────────────
  // These links enable the PLANNED guard in commission.service.ts.
  const rateKeyUpdates: Array<[source: string, isFirstOrder: boolean | null, rateKey: string]> = [
    ['MARKETPLACE', true,  'standard_commission'],
    ['MARKETPLACE', false, 'repeat_commission'],
    ['VENDOR_REFERRED', null, 'referred_commission'],
  ];

  for (const [source, isFirstOrder, rateKey] of rateKeyUpdates) {
    const result = await prisma.commissionRate.updateMany({
      where: { source: source as any, isFirstOrder, rateKey: null },
      data: { rateKey },
    });
    if (result.count > 0) {
      console.log(`[seed-terms] Backfilled rateKey=${rateKey} on ${result.count} CommissionRate rows`);
    }
  }

  console.log('[seed-terms] Rate schedule seed done.');
}

// Allow running standalone.
if (require.main === module) {
  seedTerms()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
}
