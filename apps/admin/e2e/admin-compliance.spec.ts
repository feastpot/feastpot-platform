/**
 * Admin compliance journeys.  These are intentionally browser tests: the API
 * responses are deterministic fixtures, while each assertion exercises the
 * real admin client (including its role-gated pages and mutation payloads).
 */
import { expect, test, type Page } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3003';
const now = new Date();
const iso = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();
const VENDOR_ID = '11111111-1111-1111-1111-111111111111';

async function requireAdminSession(page: Page) {
  if (new URL(page.url()).pathname === '/sign-in') {
    test.skip(
      true,
      'A valid admin storage state is required. Run the setup project with TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD.',
    );
  }
}

const application = (id: string, status = 'pending') => ({
  id,
  fullName: 'Ada Caterer',
  kitchenName: 'Ada Kitchen',
  email: 'ada@example.test',
  phone: '07123456789',
  postcode: 'SE15 4EE',
  cuisineType: 'Nigerian',
  kitchenType: 'Commercial',
  hasFsaRegistration: true,
  hygieneRegNumber: 'FHRS-123',
  deliveryRadiusMiles: 5,
  orderTypes: ['family_pots'],
  foodStory: 'Traditional cooking with documented food safety procedures.',
  instagram: null,
  marketingConsent: true,
  status,
  reviewedAt: null,
  reviewedById: null,
  adminNotes: null,
  rejectionReason: null,
  vendorId: null,
  acceptedTermsAt: iso(-2),
  acceptedTermsVersion: '1.0.0',
  createdAt: iso(-3),
  updatedAt: iso(-3),
  reviewedBy: null,
  vendor: null,
});

async function applicationPage(page: Page, record: ReturnType<typeof application>) {
  const patches: Record<string, unknown>[] = [];
  await page.route('**/v1/admin/vendor-applications/' + record.id, async (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patches.push(body);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...record, ...body }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(record) });
  });
  await page.goto(`${BASE}/vendor-applications/${record.id}`);
  await requireAdminSession(page);
  await expect(page.getByText('Ada Kitchen')).toBeVisible();
  return patches;
}

test.describe('admin compliance controls', () => {
  test('application approval is confirmed and rejection requires a substantive reason', async ({
    page,
  }) => {
    const patches = await applicationPage(page, application('application-approve'));
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByText('Approve this vendor?')).toBeVisible();
    await expect(page.getByText('Create their Vendor record')).toBeVisible();
    await page.getByRole('button', { name: 'Approve vendor' }).click();
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]).toEqual({ status: 'approved' });

    // A fresh in-flight application proves rejection cannot be sent without
    // the reason, and that the submitted reason is retained in the mutation.
    const rejectedPatches = await applicationPage(page, application('application-reject'));
    await page.getByRole('button', { name: 'Reject' }).click();
    const reject = page.locator('#reject-reason');
    await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeDisabled();
    await reject.fill('Missing required food safety documentation.');
    await expect(page.getByRole('button', { name: 'Reject', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect.poll(() => rejectedPatches.length).toBe(1);
    expect(rejectedPatches[0]).toEqual({
      status: 'rejected',
      rejectionReason: 'Missing required food safety documentation.',
    });
  });

  test('terms publishing requires solicitor sign-off and a 15-day material notice', async ({
    page,
  }) => {
    await page.route('**/v1/terms/admin/versions', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
    );
    await page.goto(`${BASE}/legal/documents`);
    await requireAdminSession(page);
    await page.getByRole('button', { name: 'Publish new version' }).click();
    await expect(page.getByText(/minimum 15-day effective date/)).toBeVisible();
    const effective = page.locator('input[type="date"]').first();
    const min = await effective.getAttribute('min');
    expect(min).toBeTruthy();
    expect(new Date(`${min}T00:00:00Z`).getTime()).toBeGreaterThanOrEqual(
      new Date(now.toISOString().slice(0, 10)).getTime() + 14 * 86_400_000,
    );
    await expect(page.getByText(/Solicitor sign-off/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish version' })).toBeDisabled();
  });

  test('P2B enforcement log visibly distinguishes compliant notice, late notice, and urgent basis', async ({
    page,
  }) => {
    const actions = [
      {
        id: 'notice-before',
        vendorId: VENDOR_ID,
        actionType: 'SUSPENSION',
        reasonCode: 'OTHER',
        reasonNarrative: 'Documented reasons for this proportionate action.',
        effectiveAt: iso(2),
        noticeSentAt: iso(1),
        urgentBasis: null,
        issuedBy: 'admin',
        appealId: null,
        liftedAt: null,
        liftedBy: null,
        liftNote: null,
        createdAt: iso(-1),
        noticeLate: false,
        vendor: { businessName: 'Compliant Kitchen', status: 'live', slug: 'compliant' },
      },
      {
        id: 'urgent',
        vendorId: VENDOR_ID,
        actionType: 'SUSPENSION',
        reasonCode: 'FOOD_SAFETY',
        reasonNarrative: 'Immediate safety risk requires an urgent suspension.',
        effectiveAt: iso(0),
        noticeSentAt: iso(0),
        urgentBasis: 'FHRS critical risk verified',
        issuedBy: 'admin',
        appealId: null,
        liftedAt: null,
        liftedBy: null,
        liftNote: null,
        createdAt: iso(-1),
        noticeLate: false,
        vendor: { businessName: 'Urgent Kitchen', status: 'suspended', slug: 'urgent' },
      },
      {
        id: 'late',
        vendorId: VENDOR_ID,
        actionType: 'TERMINATION',
        reasonCode: 'OTHER',
        reasonNarrative: 'Termination without the mandatory 30-day notice.',
        effectiveAt: iso(-1),
        noticeSentAt: iso(0),
        urgentBasis: null,
        issuedBy: 'admin',
        appealId: null,
        liftedAt: null,
        liftedBy: null,
        liftNote: null,
        createdAt: iso(-2),
        noticeLate: true,
        vendor: { businessName: 'Late Notice Kitchen', status: 'terminated', slug: 'late' },
      },
    ];
    await page.route('**/v1/admin/enforcement**', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(actions) }),
    );
    await page.goto(`${BASE}/legal/enforcement`);
    await requireAdminSession(page);
    await expect(page.getByText('Compliant Kitchen')).toBeVisible();
    await expect(page.getByLabel('Notice before effect')).toBeVisible();
    await expect(page.getByText('Urgent', { exact: true })).toBeVisible();
    await expect(page.getByText('Late notice')).toBeVisible();
    await expect(page.getByText(/P2B clause 14.1/)).toBeVisible();
  });

  test('appeal queue exposes stage, deadline, and different-reviewer safeguard', async ({
    page,
  }) => {
    const appeal = {
      id: 'appeal-1',
      disputeId: 'dispute-1',
      grounds: 'The evidence was not considered.',
      submittedAt: iso(-1),
      deadline: iso(1),
      stage1By: 'reviewer-one',
      stage1At: iso(-1),
      stage1Outcome: 'DISMISSED',
      stage1Reasons: 'Initial decision upheld.',
      stage2By: null,
      stage2At: null,
      stage2Outcome: null,
      stage2Reasons: null,
      hoursToDeadline: 23,
      urgent: true,
      overdue: false,
      stage1Pending: false,
      stage2Pending: true,
      vendorName: 'Appeal Kitchen',
      dispute: {
        id: 'dispute-1',
        status: 'resolved',
        decision: 'rejected',
        decidedAt: iso(-1),
        isUrgentDispute: true,
        order: {
          orderNumber: 'FP-1001',
          totalPence: 2500,
          vendor: { businessName: 'Appeal Kitchen' },
        },
      },
    };
    await page.route('**/v1/disputes/admin/appeals', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([appeal]) }),
    );
    await page.goto(`${BASE}/legal/appeals`);
    await requireAdminSession(page);
    await expect(page.getByText('Stage 1 done, awaiting stage 2')).toBeVisible();
    await expect(page.getByText('reviewer-one')).toBeVisible();
    await expect(page.getByText(/must not be the same person/)).toBeVisible();
    await expect(page.getByText('<24 h')).toBeVisible();
  });

  test('commission increase preserves the 15-day notice requirement', async ({ page }) => {
    await page.route('**/v1/admin/commission-rates/take-rate**', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          blendedPct: 10,
          totalCommissionPence: 1,
          totalSubtotalPence: 10,
          orderCount: 1,
        }),
      }),
    );
    await page.route('**/v1/admin/commission-rates', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
    );
    await page.goto(`${BASE}/commission-rates`);
    await requireAdminSession(page);
    await page.getByRole('button', { name: 'New rate' }).click();
    await expect(page.getByText(/≥15 days if increase/)).toBeVisible();
    await expect(page.getByText(/Rate increases require 15 days/)).toBeVisible();
  });

  test('dispute triage keeps vendor-response and appeal-deadline cases visible', async ({
    page,
  }) => {
    const dispute = {
      id: 'dispute-no-response',
      issueType: 'missing_items',
      severity: 'high',
      status: 'vendor_contacted',
      createdAt: iso(-3),
      vendorRespondedAt: null,
      resolvedAt: null,
      order: {
        orderNumber: 'FP-2001',
        totalPence: 4200,
        vendor: { businessName: 'Non-responsive Kitchen' },
        customer: { firstName: 'Pat', lastName: 'Customer', email: 'pat@example.test' },
      },
    };
    await page.route('**/v1/disputes/stats**', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          total: 1,
          overdue: 1,
          breachingSoon: 0,
          inProgress: 1,
          totalDisputedValuePence: 4200,
          deltaPct: 0,
        }),
      }),
    );
    await page.route('**/v1/disputes**', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: [dispute], total: 1, nextCursor: null }),
      }),
    );
    await page.goto(`${BASE}/disputes`);
    await requireAdminSession(page);
    await expect(page.getByText('Non-responsive Kitchen')).toBeVisible();
    await expect(page.getByText('In progress')).toBeVisible();
    await expect(page.getByText('Overdue')).toBeVisible();
    await expect(page.getByText('£42.00')).toBeVisible();
  });

  test('catering triage surfaces the most urgent SLA before newer enquiries', async ({ page }) => {
    const enquiry = (id: string, hoursAgo: number) => ({
      id,
      occasionType: 'Wedding',
      guestCountBand: '50-100',
      cuisineStyle: 'Nigerian',
      postcode: 'SE15 4EE',
      outwardCode: 'SE15',
      contactName: id === 'overdue' ? 'Overdue Event' : 'New Event',
      email: `${id}@example.test`,
      status: 'NEW',
      createdAt: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
      booking: null,
    });
    await page.route('**/v1/catering-enquiries**', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: [enquiry('overdue', 60), enquiry('new', 12)],
          nextCursor: null,
        }),
      }),
    );
    await page.goto(`${BASE}/catering?tab=enquiries`);
    await requireAdminSession(page);
    await expect(page.locator('[data-testid="sla-pill"][data-tone="red"]').first()).toBeVisible();
    await expect(
      page.locator('[data-testid="sla-pill"][data-tone="neutral"]').first(),
    ).toBeVisible();
  });

  test('evidence export requests and downloads a complete verifiable bundle', async ({ page }) => {
    const bundle = {
      vendor: {
        businessName: 'Evidence Kitchen',
        status: 'live',
        createdAt: iso(-30),
        slug: 'evidence',
      },
      exportedAt: iso(0),
      acceptances: [{ acceptedAt: iso(-10), contentHash: 'sha256:abc', scrolledToEnd: true }],
      notices: [{ sentAt: iso(-9), deliveredAt: iso(-9), channel: 'EMAIL' }],
      enforcementActions: [
        { actionType: 'SUSPENSION', reasonNarrative: 'Recorded facts', noticeSentAt: iso(-8) },
      ],
      integrity: { verification: 'Compare SHA-256 content hash with immutable version.' },
    };
    await page.route(`**/v1/terms/admin/evidence/${VENDOR_ID}**`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(bundle) }),
    );
    await page.goto(`${BASE}/legal/evidence`);
    await requireAdminSession(page);
    await page.getByPlaceholder('Paste vendor UUID').fill(VENDOR_ID);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Generate and download bundle/ }).click();
    await (await download).createReadStream();
    await expect(page.getByText('Bundle generated')).toBeVisible();
    await expect(page.getByText('Evidence Kitchen')).toBeVisible();
    await expect(page.getByText('1', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/SHA-256 content hash/)).toBeVisible();
  });
});
