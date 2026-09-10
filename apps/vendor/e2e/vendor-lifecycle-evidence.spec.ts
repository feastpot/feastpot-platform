import { expect, test } from '@playwright/test';

import { TestDataFactory, type TestIdentity } from '../../../scripts/test-factory';

const API_URL = process.env.TEST_API_URL ?? 'http://localhost:3001';

/**
 * This stays a single serial evidence chain. The public application and the
 * admin approval and vendor click-wrap are driven through their real HTTP
 * contracts. Stripe/background-job facts are persisted against that exact
 * provisioned vendor, then reconciled below; no browser routes are mocked.
 */
test.describe.serial('factory vendor lifecycle evidence chain', () => {
  test('public application → A1 approval → vendor tax/document/menu/order/payout chain', async ({
    request,
  }) => {
    test.setTimeout(360_000);
    const namespace = process.env.TEST_FACTORY_NAMESPACE;
    if (!namespace) throw new Error('TEST_FACTORY_NAMESPACE is required for lifecycle evidence.');
    const factory = TestDataFactory.fromEnvironment({ namespace });
    let admin: TestIdentity | undefined;
    let customer: TestIdentity | undefined;
    let vendorIdentity: TestIdentity | undefined;
    let applicationId: string | undefined;
    let itemId: string | undefined;
    let orderId: string | undefined;
    let payoutId: string | undefined;
    try {
      admin = await factory.create('A1');
      const runId = Date.now().toString(36);
      const applicationEmail = `tf-${namespace}-lifecycle-${runId}@test.feastpot.co.uk`;
      const applicationPhone = `07000${Date.now().toString().slice(-6)}`;
      const application = await request.post(`${API_URL}/v1/vendors/register-interest`, {
        data: {
          fullName: 'Lifecycle Public Applicant',
          kitchenName: `Lifecycle Public Kitchen ${runId}`,
          email: applicationEmail,
          phone: applicationPhone,
          postcode: 'SE15 4ST',
          cuisineType: 'Nigerian',
          kitchenType: 'home',
          hasFoodHygieneRegistration: true,
          hygieneRegNumber: `LIFECYCLE-REG-${runId}`,
          deliveryRadiusMiles: 5,
          orderTypes: ['family_pots'],
          foodStory: 'A public factory application used only for lifecycle acceptance testing.',
          acceptedTermsAt: new Date().toISOString(),
        },
      });
      expect(application.status()).toBe(201);
      const created = (await application.json()) as { id: string; status: string };
      applicationId = created.id;
      expect(created.status).toBe('pending');

      const adminToken = await factory.issueAccessToken(admin);
      const approval = await request.patch(
        `${API_URL}/v1/admin/vendor-applications/${applicationId}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          data: { status: 'approved', adminNotes: 'Factory lifecycle approval.' },
        },
      );
      const approved = (await approval.json()) as {
        id: string;
        status: string;
        vendor?: { id: string; status: string };
        message?: string;
      };
      expect(approval.status(), JSON.stringify(approved)).toBe(200);
      expect(approved).toMatchObject({ id: applicationId, status: 'approved' });
      expect(approved.vendor?.id).toBeTruthy();

      const applicationRow = await factory.prisma.vendorApplication.findUniqueOrThrow({
        where: { id: applicationId },
      });
      const vendorId = applicationRow.vendorId;
      if (!vendorId) throw new Error('Approved application did not provision a vendor.');
      const vendor = await factory.prisma.vendor.findUniqueOrThrow({ where: { id: vendorId } });
      expect(vendor.userId).toBeTruthy();
      vendorIdentity = {
        state: 'V5',
        credentials: {
          email: applicationEmail,
          password: await factory.setApprovedVendorTestPassword(vendor.userId),
          role: 'vendor',
        },
        userId: vendor.userId,
        vendorId,
        vendorApplicationId: applicationId,
        relatedUserIds: [],
        relatedVendorIds: [vendorId],
        storageObjects: [],
      };

      // Approval does not imply consent. Establish a real password session for
      // the user that admin approval provisioned, prove the gate is closed, and
      // submit the same click-wrap API payload the portal sends after scrolling.
      const vendorToken = await factory.issueAccessToken(vendorIdentity);
      const acceptanceStatus = await request.get(`${API_URL}/v1/terms/acceptance-status`, {
        headers: { Authorization: `Bearer ${vendorToken}` },
      });
      expect(acceptanceStatus.status()).toBe(200);
      expect((await acceptanceStatus.json()) as { accepted: boolean }).toMatchObject({
        accepted: false,
      });
      const currentTerms = await request.get(`${API_URL}/v1/terms/current`, {
        params: { documentType: 'VENDOR_TERMS' },
      });
      expect(currentTerms.status()).toBe(200);
      const current = (await currentTerms.json()) as { id: string | null; version: string };
      if (!current.id)
        throw new Error('Lifecycle requires a currently effective vendor terms version.');
      const acceptedTerms = await request.post(
        `${API_URL}/v1/terms/versions/${current.id}/accept`,
        {
          headers: { Authorization: `Bearer ${vendorToken}` },
          data: {
            acceptanceText: `I have read and agree to the Feastpot Vendor Terms of Agreement version ${current.version}, including the Rate Schedule.`,
            scrolledToEnd: true,
          },
        },
      );
      expect(acceptedTerms.status()).toBe(200);
      await expect
        .poll(async () =>
          factory.prisma.termsAcceptance.findFirst({
            where: { vendorId, termsVersionId: current.id },
            select: { acceptanceText: true, scrolledToEnd: true },
          }),
        )
        .toMatchObject({
          acceptanceText: `I have read and agree to the Feastpot Vendor Terms of Agreement version ${current.version}, including the Rate Schedule.`,
          scrolledToEnd: true,
        });

      const vendorHeaders = { Authorization: `Bearer ${vendorToken}` };
      const adminHeaders = { Authorization: `Bearer ${adminToken}` };

      // Admin go-live is a real gate: terms alone are insufficient.
      const earlyLive = await request.patch(`${API_URL}/v1/vendors/${vendorId}/status`, {
        headers: adminHeaders,
        data: { status: 'live' },
      });
      expect(earlyLive.status()).toBe(400);

      const taxResponse = await request.put(`${API_URL}/v1/vendors/me/tax-profile`, {
        headers: vendorHeaders,
        data: {
          entityType: 'LIMITED_COMPANY',
          legalName: `Lifecycle Public Kitchen ${runId} Ltd`,
          addressLine1: '1 Test Factory Way',
          city: 'London',
          postcode: 'SE15 4ST',
          country: 'GB',
          companyNumber: '12345678',
          taxIdentifier: '1234567890',
        },
      });
      expect(taxResponse.status()).toBe(200);

      const compliance = await request.patch(`${API_URL}/v1/vendors/${vendorId}/compliance`, {
        headers: adminHeaders,
        data: {
          complianceStatus: 'RATED',
          fsaHygieneRating: 5,
          fsaRatingDate: new Date().toISOString(),
          fsaRegistrationNumber: `LIFECYCLE-REG-${runId}`,
          fsaLastChecked: new Date().toISOString(),
        },
      });
      expect(compliance.status()).toBe(200);

      for (const type of ['hygiene_cert', 'insurance', 'photo_id'] as const) {
        const uploaded = await request.post(`${API_URL}/v1/vendors/${vendorId}/documents`, {
          headers: vendorHeaders,
          multipart: {
            type,
            file: {
              name: `lifecycle-${type}.pdf`,
              mimeType: 'application/pdf',
              buffer: Buffer.from(`%PDF-1.4\n% lifecycle ${type} evidence\n`),
            },
          },
        });
        expect(uploaded.status(), `${type} upload`).toBe(201);
        const uploadedDocument = (await uploaded.json()) as { id: string };
        const verified = await request.patch(
          `${API_URL}/v1/vendors/${vendorId}/documents/${uploadedDocument.id}/verify`,
          { headers: adminHeaders, data: { status: 'verified' } },
        );
        expect(verified.status(), `${type} verification`).toBe(200);
      }
      const verificationEvidence = {
        insuranceProvider: 'Lifecycle Test Insurer',
        insuranceCoverPence: 500_000_000,
        insuranceValidUntil: new Date('2099-01-01T00:00:00Z'),
        idVerifiedAt: new Date(),
      };
      await factory.prisma.vendorVerification.upsert({
        where: { vendorId },
        create: {
          vendorId,
          registrationNumber: `LIFECYCLE-REG-${runId}`,
          registrationAuthority: 'Test Council',
          registrationConfirmedAt: new Date(),
          fhrsRating: 5,
          fhrsRatingCheckedAt: new Date(),
          fhrsInspectionStatus: 'RATED',
          overallState: 'VERIFIED',
          ...verificationEvidence,
        },
        update: verificationEvidence,
      });

      const menuResponse = await request.post(`${API_URL}/v1/vendors/${vendorId}/menus`, {
        headers: vendorHeaders,
        data: { name: 'Lifecycle evidence menu', isActive: true },
      });
      expect(menuResponse.status()).toBe(201);
      const menu = (await menuResponse.json()) as { id: string };
      const itemResponse = await request.post(
        `${API_URL}/v1/vendors/${vendorId}/menus/${menu.id}/items`,
        {
          headers: vendorHeaders,
          data: {
            name: 'Lifecycle allergen dish',
            description: 'Continuous lifecycle evidence dish.',
            category: 'mains',
            basePricePence: 1000,
            allergens: ['milk'],
            prepTimeMinutes: 15,
            isAvailable: true,
          },
        },
      );
      expect(itemResponse.status()).toBe(201);
      const createdItem = (await itemResponse.json()) as {
        id: string;
        moderationStatus: 'held' | 'approved' | 'auto_approved';
        submissionVersion: number;
      };
      itemId = createdItem.id;
      if (createdItem.moderationStatus === 'held') {
        const moderation = await request.patch(
          `${API_URL}/v1/admin/menu-items/${itemId}/moderation`,
          {
            headers: adminHeaders,
            data: {
              status: 'approved',
              expectedStatus: createdItem.moderationStatus,
              expectedSubmissionVersion: createdItem.submissionVersion,
            },
          },
        );
        expect(moderation.status(), 'menu moderation').toBe(200);
      }

      const stripeAccount = `acct_tf_${applicationId.replaceAll('-', '').slice(0, 16)}`;
      const stripe = await request.post(`${API_URL}/v1/test/vendor-lifecycle/account-updated`, {
        headers: {
          ...vendorHeaders,
          'x-test-factory-namespace': namespace,
        },
        data: {
          eventId: `evt_tf_${applicationId.replaceAll('-', '')}`,
          created: Math.floor(Date.now() / 1000),
          account: {
            id: stripeAccount,
            object: 'account',
            charges_enabled: true,
            payouts_enabled: true,
            requirements: {
              currently_due: [],
              eventually_due: [],
              past_due: [],
              pending_verification: [],
              disabled_reason: null,
            },
          },
        },
      });
      expect(stripe.status()).toBe(201);
      await factory.prisma.vendorTaxProfile.update({
        where: { vendorId },
        data: {
          financialAccountId: 'GB:TEST:****4242',
          accountHolderName: `Lifecycle Public Kitchen ${runId} Ltd`,
        },
      });
      const deliveryConfig = await request.put(`${API_URL}/v1/vendors/me/delivery-config`, {
        headers: vendorHeaders,
        data: {
          types: ['local'],
          postcodes: ['SE15'],
          kitchenPostcode: 'SE15 4ST',
          localRadiusMiles: 10,
          localFeePence: 250,
        },
      });
      expect(deliveryConfig.status()).toBe(200);

      const goLive = await request.patch(`${API_URL}/v1/vendors/${vendorId}/status`, {
        headers: adminHeaders,
        data: { status: 'live' },
      });
      expect(goLive.status()).toBe(200);

      // Publication is only useful if the same vendor crosses the public
      // discovery boundary. Search is intentionally exercised through the
      // running API, while Stripe and notification delivery remain test
      // boundary adapters above.
      const search = await request.get(`${API_URL}/v1/vendors`, {
        params: { postcode: 'SE15' },
      });
      expect(search.status()).toBe(200);
      const searchBody = (await search.json()) as
        | Array<{ id: string }>
        | { data?: Array<{ id: string }> };
      const searchRows = Array.isArray(searchBody) ? searchBody : (searchBody.data ?? []);
      expect(searchRows.some((row) => row.id === vendorId)).toBe(true);

      customer = await factory.create('C1');
      const customerToken = await factory.issueAccessToken(customer);
      const orderResponse = await request.post(`${API_URL}/v1/test/vendor-lifecycle/orders`, {
        headers: {
          Authorization: `Bearer ${customerToken}`,
          'x-test-factory-namespace': namespace,
        },
        data: {
          vendorId,
          items: [{ menuItemId: itemId, quantity: 1 }],
          scheduledFor: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          allergenConfirmed: true,
        },
      });
      expect(orderResponse.status()).toBe(201);
      orderId = ((await orderResponse.json()) as { orderId: string }).orderId;

      for (const status of ['accepted', 'preparing', 'ready', 'delivered']) {
        const transition = await request.patch(`${API_URL}/v1/orders/${orderId}/status`, {
          headers: vendorHeaders,
          data: { status },
        });
        expect(transition.status(), `transition to ${status}`).toBe(200);
      }

      const today = new Date();
      const daysUntilMonday = (8 - today.getUTCDay()) % 7 || 7;
      const batchNow = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + daysUntilMonday),
      );
      batchNow.setUTCHours(1);
      const batch = await request.post(`${API_URL}/v1/test/vendor-lifecycle/weekly-batch`, {
        headers: {
          ...vendorHeaders,
          'x-test-factory-namespace': namespace,
        },
        data: { now: batchNow.toISOString() },
      });
      expect(batch.status()).toBe(201);
      payoutId = ((await batch.json()) as { id: string }).id;

      const payoutResponse = await request.get(`${API_URL}/v1/payouts/${payoutId}`, {
        headers: vendorHeaders,
      });
      expect(payoutResponse.status()).toBe(200);
      const payout = (await payoutResponse.json()) as {
        id: string;
        amountPence: number;
        statement: unknown;
      };
      const repeatRetrieval = await request.get(`${API_URL}/v1/payouts/${payoutId}`, {
        headers: vendorHeaders,
      });
      expect(await repeatRetrieval.json()).toEqual(payout);
      const repeatBatch = await request.post(`${API_URL}/v1/test/vendor-lifecycle/weekly-batch`, {
        headers: {
          ...vendorHeaders,
          'x-test-factory-namespace': namespace,
        },
        data: { now: batchNow.toISOString() },
      });
      expect(((await repeatBatch.json()) as { id: string }).id).toBe(payoutId);

      const [tax, document, item, persistedOrder, persistedPayout] = await Promise.all([
        factory.prisma.vendorTaxProfile.findUniqueOrThrow({ where: { vendorId } }),
        factory.prisma.vendorDocument.findFirstOrThrow({
          where: { vendorId, type: 'hygiene_cert' },
        }),
        factory.prisma.menuItem.findUniqueOrThrow({ where: { id: itemId } }),
        factory.prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
        factory.prisma.payout.findUniqueOrThrow({ where: { id: payoutId } }),
      ]);
      expect(tax).toMatchObject({ entityType: 'LIMITED_COMPANY', companyNumber: '12345678' });
      expect(document.status).toBe('verified');
      expect(item).toMatchObject({ isAvailable: true, allergens: ['milk'] });
      expect(persistedOrder).toMatchObject({ status: 'delivered', vendorId });
      expect(persistedPayout).toMatchObject({
        vendorId,
        amountPence: persistedOrder.vendorPayoutPence,
      });
      expect(persistedPayout.statement).toEqual(payout.statement);
    } finally {
      // The vendor teardown removes its menus/orders/payouts/documents/tax row
      // and the Supabase user provisioned by real admin approval.
      if (vendorIdentity) await factory.teardown(vendorIdentity);
      else if (applicationId)
        await factory.prisma.vendorApplication.deleteMany({ where: { id: applicationId } });
      if (customer) await factory.teardown(customer);
      if (admin) await factory.teardown(admin);
      await factory.dispose();
    }
  });
});
