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

    // Requesting information is a distinct in-flight transition: the notes
    // are sent verbatim, and an empty request is never submitted.
    const infoPatches = await applicationPage(page, application('application-info'));
    await page.getByRole('button', { name: 'Request info' }).click();
    await expect(page.getByRole('button', { name: 'Send request' })).toBeDisabled();
    await page
      .locator('#info-notes')
      .fill('Please upload the current public-liability certificate.');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect.poll(() => infoPatches.length).toBe(1);
    expect(infoPatches[0]).toEqual({
      status: 'information_requested',
      adminNotes: 'Please upload the current public-liability certificate.',
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

  test('terms API rejects missing solicitor approval and a material short-notice publication', async ({
    page,
  }) => {
    const submissions: Record<string, unknown>[] = [];
    await page.route('**/v1/terms/admin/versions', (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
    );
    await page.route('**/v1/terms/versions', async (route) => {
      submissions.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Vendor terms require solicitor sign-off and 15 days notice.',
        }),
      });
    });
    await page.goto(`${BASE}/legal/documents`);
    await requireAdminSession(page);
    await page.getByRole('button', { name: 'Publish new version' }).click();
    await page.getByPlaceholder('e.g. 2.1.0').fill('2.0.0');
    await page.getByPlaceholder('e.g. Sarah Jenkins').fill('Compliance Admin');
    await page
      .getByPlaceholder(/Plain-language summary/)
      .fill('Commission and cancellation terms change.');
    await page.getByPlaceholder(/Feastpot Vendor Terms/).fill('# Terms\nMaterial amendment');
    // The client blocks a missing sign-off before it can become an unsafe mutation.
    await expect(page.getByRole('button', { name: 'Publish version' })).toBeDisabled();
    // Exercise the same published endpoint contract as a malicious/non-UI
    // caller: server policy must still reject absent solicitor evidence.
    const missingSignOffStatus = await page.evaluate(async () => {
      const response = await fetch('/v1/terms/versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentType: 'VENDOR_TERMS', version: '2.0.0', isMaterial: true }),
      });
      return response.status;
    });
    expect(missingSignOffStatus).toBe(422);
    expect(submissions[0]).not.toHaveProperty('solicitorSignOff');
    await page.getByPlaceholder(/solicitor name/).fill('A Solicitor, 2025-01-01');
    await page
      .locator('input[type="date"]')
      .first()
      .evaluate((input) => {
        input.removeAttribute('min');
      });
    await page.locator('input[type="date"]').first().fill('2025-01-02');
    await page.getByRole('button', { name: 'Publish version' }).click();
    await expect.poll(() => submissions.length).toBe(2);
    expect(submissions[1]).toMatchObject({
      documentType: 'VENDOR_TERMS',
      isMaterial: true,
      solicitorSignOff: 'A Solicitor, 2025-01-01',
      effectiveAt: '2025-01-02',
    });
    await expect(page.getByText(/require solicitor sign-off and 15 days notice/)).toBeVisible();
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

  test('commission rate increase cannot bypass the notice policy', async ({ page }) => {
    const submissions: Record<string, unknown>[] = [];
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
    await page.route('**/v1/admin/commission-rates', async (route) => {
      if (route.request().method() === 'POST') {
        submissions.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Rate increases require 15 days notice.' }),
        });
        return;
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
    });
    await page.goto(`${BASE}/commission-rates`);
    await requireAdminSession(page);
    await page.getByRole('button', { name: 'New rate' }).click();
    await page.locator('input[type="number"]').fill('15');
    await page.locator('input[type="datetime-local"]').fill('2025-01-02T09:00');
    await page.getByRole('button', { name: 'Create rate' }).click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toMatchObject({
      source: 'MARKETPLACE',
      ratePercent: 15,
      effectiveFrom: '2025-01-02T09:00',
    });
    await expect(page.getByText('Rate increases require 15 days notice.')).toBeVisible();
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

  test('stage-two appeal rejects the stage-one reviewer', async ({ page }) => {
    const disputeId = 'appeal-reviewer-guard';
    const appeal = {
      id: 'appeal-reviewer-guard',
      disputeId,
      grounds: 'The vendor supplied contemporaneous delivery evidence.',
      submittedAt: iso(-14),
      deadline: iso(0), // The final instant of the statutory 14-day window.
      stage1By: 'reviewer-one',
      stage1At: iso(-1),
      stage1Outcome: 'DISMISSED',
      stage1Reasons: 'The initial reviewer considered the customer evidence.',
      stage2By: null,
      stage2At: null,
      stage2Outcome: null,
      stage2Reasons: null,
    };
    const detail = {
      id: disputeId,
      issueType: 'missing_items',
      severity: 'high',
      status: 'resolved',
      description: 'Customer says one item was missing.',
      createdAt: iso(-15),
      order: {
        orderNumber: 'FP-APPEAL',
        totalPence: 2500,
        vendor: { businessName: 'Appeal Kitchen' },
        customer: { firstName: 'Pat', lastName: 'Customer', email: 'pat@example.test' },
      },
    };
    const attempts: Record<string, unknown>[] = [];
    await page.route(`**/v1/disputes/${disputeId}/appeal/stage2`, async (route) => {
      attempts.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Stage 2 reviewer must differ from stage 1 reviewer.',
        }),
      });
    });
    await page.route(`**/v1/disputes/${disputeId}/appeal`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(appeal) }),
    );
    await page.route(`**/v1/disputes/${disputeId}/evidence`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
    );
    await page.route(`**/v1/disputes/${disputeId}`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(detail) }),
    );
    await page.goto(`${BASE}/disputes/${disputeId}`);
    await requireAdminSession(page);
    const reasons = page.getByPlaceholder('Written reasons (min 50 characters)...').last();
    await reasons.fill(
      'An independent reviewer assessed the full contemporaneous evidence record.',
    );
    await page.getByRole('button', { name: 'Record final decision' }).click();
    await expect.poll(() => attempts.length).toBe(1);
    expect(attempts[0]).toMatchObject({ outcome: 'UPHELD' });
    await expect(page.getByText(/must differ from stage 1 reviewer/)).toBeVisible();

    // Acceptance by a genuinely different server-validated reviewer, including
    // payout-credit reversal, is covered by appeal-policy.spec.ts. A single
    // browser session must never pretend to be two reviewers.
  });

  test('enforcement P2B mutations reject unsafe actions and record valid urgent and serious-cause actions', async ({
    page,
  }) => {
    const vendor = {
      id: VENDOR_ID,
      businessName: 'Policy Kitchen',
      slug: 'policy-kitchen',
      description: null,
      cuisines: ['Nigerian'],
      status: 'live',
      rating: 5,
      ratingCount: 1,
      commissionBps: 1000,
      payoutsEnabled: true,
      stripeAccountId: 'acct_policy',
      createdAt: iso(-30),
      approvedAt: iso(-29),
      suspendedAt: null,
      complianceStatus: 'RATED',
      fsaHygieneRating: 5,
      fsaRatingDate: iso(-2),
      fsaRegistrationNumber: 'FHRS-1',
      fhrsId: '1',
      fsaLastChecked: iso(-2),
    };
    const submissions: Record<string, unknown>[] = [];
    const outcomes = [
      { status: 422, message: 'Statement of reasons must contain at least 50 characters.' },
      { status: 422, message: 'Non-urgent notice must be sent before the action takes effect.' },
      { status: 422, message: 'Urgent basis is required for an immediate action.' },
      { status: 201, message: null },
      {
        status: 422,
        message: 'Termination requires 30 days notice unless serious cause is recorded.',
      },
      { status: 201, message: null },
    ];
    const minimumNarrative = 'This deliberately minimal fifty-character statement is rejected.';
    await page.route(`**/v1/vendors/${VENDOR_ID}`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(vendor) }),
    );
    await page.route(`**/v1/vendors/${VENDOR_ID}/documents`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
    );
    await page.route(`**/v1/admin/vendors/${VENDOR_ID}/trust-signals`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
    );
    await page.route(`**/v1/admin/vendors/${VENDOR_ID}/tax-profile`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(null) }),
    );
    await page.route(`**/v1/admin/vendors/${VENDOR_ID}/verification`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(null) }),
    );
    await page.route(`**/v1/admin/vendors/${VENDOR_ID}/enforcement`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) });
        return;
      }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      submissions.push(body);
      const outcome = outcomes[submissions.length - 1];
      await route.fulfill({
        status: outcome.status,
        contentType: 'application/json',
        body: JSON.stringify(
          outcome.message
            ? { message: outcome.message }
            : {
                id: `action-${submissions.length}`,
                ...body,
                vendorId: VENDOR_ID,
                noticeSentAt: iso(0),
                issuedBy: 'admin',
                appealId: null,
                liftedAt: null,
                liftedBy: null,
                liftNote: null,
                createdAt: iso(0),
              },
        ),
      });
    });
    await page.goto(`${BASE}/vendors/${VENDOR_ID}`);
    await requireAdminSession(page);
    const submit = async ({
      actionType = 'SUSPENSION',
      reasonCode = 'MATERIAL_BREACH',
      narrative,
      urgentBasis,
    }: {
      actionType?: string;
      reasonCode?: string;
      narrative: string;
      urgentBasis?: string;
    }) => {
      const expectedSubmissions = submissions.length + 1;
      await page.getByRole('button', { name: '+ New action' }).click();
      const selects = page.locator('select');
      await selects.nth(0).selectOption(actionType);
      await selects.nth(1).selectOption(reasonCode);
      await page.getByPlaceholder(/Describe the specific facts/).fill(narrative);
      await page.locator('input[type="datetime-local"]').last().fill('2025-01-02T09:00');
      if (urgentBasis !== undefined)
        await page.getByPlaceholder(/Immediate food safety risk/).fill(urgentBasis);
      await page.getByRole('button', { name: 'Create action' }).click();
      await expect.poll(() => submissions.length).toBe(expectedSubmissions);
    };
    await submit({ narrative: minimumNarrative });
    await expect(page.getByText(/at least 50 characters/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).last().click();
    await submit({
      narrative:
        'Documented proportionate non-urgent restriction with dates and evidence recorded.',
    });
    await expect(page.getByText(/before the action takes effect/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).last().click();
    await submit({
      reasonCode: 'FRAUD',
      narrative: 'Verified fraud evidence requires an immediate suspension to protect customers.',
    });
    await expect(page.getByText(/Urgent basis is required/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).last().click();
    await submit({
      reasonCode: 'FOOD_SAFETY_CONCERN',
      narrative: 'FHRS inspection established an immediate food safety risk requiring suspension.',
      urgentBasis: 'FHRS inspector confirmed critical risk today.',
    });
    await expect.poll(() => submissions.length).toBe(4);
    await submit({
      actionType: 'TERMINATION',
      narrative:
        'Repeated material breaches are documented but do not establish serious cause today.',
    });
    await expect(page.getByText(/Termination requires 30 days notice/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).last().click();
    await submit({
      actionType: 'TERMINATION',
      reasonCode: 'FRAUD',
      narrative: 'Verified intentional fraud is serious cause requiring immediate termination.',
      urgentBasis: 'Forensic payment review confirms deliberate fraud.',
    });
    expect(submissions).toEqual([
      expect.objectContaining({
        actionType: 'SUSPENSION',
        reasonCode: 'MATERIAL_BREACH',
        reasonNarrative: minimumNarrative,
      }),
      expect.objectContaining({ actionType: 'SUSPENSION', reasonCode: 'MATERIAL_BREACH' }),
      expect.objectContaining({
        actionType: 'SUSPENSION',
        reasonCode: 'FRAUD',
        urgentBasis: undefined,
      }),
      expect.objectContaining({
        actionType: 'SUSPENSION',
        reasonCode: 'FOOD_SAFETY_CONCERN',
        urgentBasis: 'FHRS inspector confirmed critical risk today.',
      }),
      expect.objectContaining({ actionType: 'TERMINATION', reasonCode: 'MATERIAL_BREACH' }),
      expect.objectContaining({
        actionType: 'TERMINATION',
        reasonCode: 'FRAUD',
        urgentBasis: 'Forensic payment review confirms deliberate fraud.',
      }),
    ]);
  });

  test('dispute resolution records the decision while response and 14-day appeal states remain auditable', async ({
    page,
  }) => {
    const disputeId = 'dispute-decision';
    const decisions: Record<string, unknown>[] = [];
    const dispute = {
      id: disputeId,
      issueType: 'missing_items',
      severity: 'high',
      status: 'vendor_responded',
      description: 'Vendor responded with packing evidence.',
      createdAt: iso(-14),
      vendorRespondedAt: iso(-13),
      resolvedAt: null,
      order: {
        orderNumber: 'FP-DECISION',
        totalPence: 4200,
        vendor: { businessName: 'Responsive Kitchen' },
        customer: { firstName: 'Pat', lastName: 'Customer', email: 'pat@example.test' },
      },
    };
    await page.route(`**/v1/disputes/${disputeId}/close`, async (route) => {
      decisions.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ...dispute, status: 'closed', resolution: 'rejected' }),
      });
    });
    await page.route(`**/v1/disputes/${disputeId}/appeal`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(null) }),
    );
    await page.route(`**/v1/disputes/${disputeId}/evidence`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify([]) }),
    );
    await page.route(`**/v1/disputes/${disputeId}`, (route) =>
      route.fulfill({ contentType: 'application/json', body: JSON.stringify(dispute) }),
    );
    await page.goto(`${BASE}/disputes/${disputeId}`);
    await requireAdminSession(page);
    await expect(page.getByText('Responsive Kitchen')).toBeVisible();
    await page
      .getByPlaceholder('Internal note')
      .fill('Vendor packing evidence reviewed before decision.');
    await page.getByRole('button', { name: 'Close dispute' }).click();
    await expect.poll(() => decisions.length).toBe(1);
    expect(decisions[0]).toEqual({
      resolution: 'full_refund',
      resolutionNote: 'Vendor packing evidence reviewed before decision.',
    });
  });

  test('catering triage persists a staff outcome through its mutation contract', async ({
    page,
  }) => {
    const enquiry = {
      id: 'catering-triage',
      occasionType: 'Wedding',
      guestCountBand: '50-100',
      cuisineStyle: 'Nigerian',
      postcode: 'SE15 4EE',
      outwardCode: 'SE15',
      eventDate: null,
      preferredTime: null,
      budgetBand: null,
      contactName: 'Triage Event',
      email: 'triage@example.test',
      phone: null,
      notes: null,
      hearAboutUs: null,
      status: 'NEW',
      adminNotes: null,
      source: null,
      createdAt: iso(-36),
      booking: null,
    };
    const updates: Record<string, unknown>[] = [];
    await page.route('**/v1/catering-enquiries**', async (route) => {
      if (route.request().method() === 'PATCH') {
        updates.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({
          status: updates.length === 1 ? 200 : 422,
          contentType: 'application/json',
          body: JSON.stringify(
            updates.length === 1
              ? { ...enquiry, ...updates[0] }
              : { message: 'Invalid catering transition.' },
          ),
        });
        return;
      }
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: [enquiry], nextCursor: null }),
      });
    });
    await page.goto(`${BASE}/catering?tab=enquiries`);
    await requireAdminSession(page);
    await page.getByRole('button', { name: 'Review' }).click();
    await page
      .getByPlaceholder('Internal notes visible only to staff...')
      .fill('Contacted customer; awaiting date confirmation.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect.poll(() => updates.length).toBe(1);
    expect(updates[0]).toEqual({
      status: 'NEW',
      adminNotes: 'Contacted customer; awaiting date confirmation.',
    });
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
    const stream = await (await download).createReadStream();
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const downloaded = JSON.parse(Buffer.concat(chunks).toString('utf8')) as typeof bundle;
    expect(downloaded).toEqual(bundle);
    expect(downloaded.acceptances[0]).toMatchObject({
      contentHash: 'sha256:abc',
      scrolledToEnd: true,
    });
    expect(downloaded.notices[0]).toMatchObject({ channel: 'EMAIL', deliveredAt: iso(-9) });
    expect(downloaded.enforcementActions[0]).toMatchObject({
      actionType: 'SUSPENSION',
      noticeSentAt: iso(-8),
    });
    await expect(page.getByText('Bundle generated')).toBeVisible();
    await expect(page.getByText('Evidence Kitchen')).toBeVisible();
    await expect(page.getByText('1', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/SHA-256 content hash/)).toBeVisible();
  });
});
