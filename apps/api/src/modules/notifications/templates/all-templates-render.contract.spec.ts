import { TEMPLATES } from '.';

const fixture: Record<string, unknown> = {
  accepted: true,
  actionType: 'SUSPENSION',
  adjustmentsPence: 100,
  affectedCount: 2,
  affectedItemCount: 2,
  amountPence: 5_000,
  appealClause: 'You may appeal within 14 days.',
  appealDeadline: '17 September 2026',
  appealWindowDays: 14,
  appealsEmail: 'appeals@example.com',
  balancePence: 4_000,
  balanceChargeDate: '18 September 2026',
  businessName: 'Test Kitchen',
  canEscalate: true,
  chargebacksPence: 0,
  clauseRef: 'Section 4',
  commissionPence: 400,
  complianceEmail: 'compliance@example.com',
  creditPence: 100,
  cuisineStyle: 'West African',
  customerFirstName: 'Alex',
  customerName: 'Alex Customer',
  daysUntilExpiry: 7,
  deadline: '17 September 2026',
  deductionPence: 100,
  depositPence: 2_000,
  disputeId: 'dispute-1',
  documentType: 'Insurance',
  effectiveAt: '18 September 2026',
  enquiryId: 'enquiry-1',
  errorSummary: 'Delivery delayed',
  etaText: '18:30',
  eventDate: '20 September 2026',
  eventType: 'Wedding',
  expiresAt: '17 September 2026',
  expiringFields: ['Insurance'],
  feesPounds: '4.00',
  grossPence: 10_000,
  grossPounds: '100.00',
  groundsPreview: 'The order was delivered.',
  guestCount: 40,
  guestCountBand: '31-50',
  holdReason: 'Account review',
  isFinal: false,
  isUrgent: true,
  issueType: 'Delivery',
  items: [{ name: 'Jollof rice', qty: 2, pricePence: 1_500 }],
  liftNote: 'Documents verified.',
  loyaltyPointsEarned: 50,
  netPence: 9_500,
  note: 'Please use the side entrance.',
  occasionType: 'Wedding',
  orderCount: 4,
  orderId: 'order-1',
  orderNumber: 'FP-1001',
  outcome: 'UPHELD',
  payoutDate: '21 September 2026',
  periodEnd: '7 September 2026',
  periodStart: '1 September 2026',
  pendingOrderCount: 2,
  portalUrl: 'https://vendor.feastpot.co.uk',
  postcode: 'SW1A 1AA',
  priceDeltaPence: 200,
  proposedChange: 'Replace one dish.',
  quarterlyBreakdown: {
    q1: { grossPence: 2_500, feesPence: 200, orderCount: 1 },
    q2: { grossPence: 2_500, feesPence: 200, orderCount: 1 },
    q3: { grossPence: 2_500, feesPence: 200, orderCount: 1 },
    q4: { grossPence: 2_500, feesPence: 200, orderCount: 1 },
  },
  reason: 'Test reason',
  reasonCode: 'TEST_REASON',
  reasonNarrative: 'A complete explanation.',
  reasons: 'Evidence supported the decision.',
  referralUrl: 'https://feastpot.co.uk/v/test-kitchen',
  refundsPence: 0,
  reportCount: 1,
  reportingYear: 2026,
  resolution: 'Resolved',
  resolutionNote: 'No further action required.',
  scheduledFor: '18 September 2026',
  serviceFeesPence: 200,
  stage: 1,
  statement: {
    appliedCommissionRates: [
      { source: 'MARKETPLACE_FIRST', effectiveCommissionRatePercent: '8.00' },
      { source: 'MARKETPLACE_REPEAT', effectiveCommissionRatePercent: '5.00' },
      { source: 'VENDOR_REFERRED', effectiveCommissionRatePercent: '0.00' },
    ],
    summary: { effectiveBlendedRatePercent: '4.33' },
  },
  statementUrl: 'https://vendor.feastpot.co.uk/payouts',
  stripeDashboardUrl: 'https://dashboard.stripe.com/test',
  supportEmail: 'support@example.com',
  totalPence: 10_200,
  unsentCopies: 1,
  vendorFirstName: 'Sam',
  vendorId: 'vendor-1',
  vendorName: 'Test Kitchen',
  vendorResponse: 'The order was delivered on time.',
};

describe('notification template render contract', () => {
  it.each(Object.entries(TEMPLATES))(
    '%s renders complete subject and channel bodies',
    (_, template) => {
      const subject = template.subject(fixture);
      const html = template.render(fixture);

      expect(subject.trim()).not.toBe('');
      expect(html.trim()).not.toBe('');

      for (const output of [subject, html, template.sms?.(fixture)].filter(
        (value): value is string => typeof value === 'string',
      )) {
        expect(output).not.toMatch(/\bundefined\b/);
        expect(output).not.toContain('[object Object]');
        expect(output).not.toMatch(/{{[^}]+}}/);
      }
    },
  );
});
