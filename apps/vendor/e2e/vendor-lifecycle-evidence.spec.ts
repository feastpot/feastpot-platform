import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { TestDataFactory, type TestIdentity } from '../../../scripts/test-factory';

const API_URL = process.env.TEST_API_URL ?? 'http://localhost:3001';

/**
 * This stays a single serial evidence chain. The public application and the
 * admin approval are driven through their real HTTP contracts; post-approval
 * evidence that is owned by Stripe/background jobs is deliberately persisted
 * as an isolated fixture and reconciled against the provisioned vendor.
 */
test.describe.serial('factory vendor lifecycle evidence chain', () => {
  test('public application → A1 approval → vendor tax/document/menu/order/payout chain', async ({
    request,
  }) => {
    const namespace = `vendor-lifecycle-${randomUUID()}`;
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
      const applicationEmail = `tf-${namespace}@test.feastpot.co.uk`;
      const application = await request.post(`${API_URL}/v1/vendors/register-interest`, {
        data: {
          fullName: 'Lifecycle Public Applicant',
          kitchenName: 'Lifecycle Public Kitchen',
          email: applicationEmail,
          phone: '07700900000',
          postcode: 'SE15 4ST',
          cuisineType: 'Nigerian',
          kitchenType: 'home',
          hasFoodHygieneRegistration: true,
          hygieneRegNumber: 'LIFECYCLE-REG-001',
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
      expect(approval.status()).toBe(200);
      const approved = (await approval.json()) as {
        id: string;
        status: string;
        vendor?: { id: string; status: string };
      };
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
        credentials: { email: applicationEmail, password: null, role: 'vendor' },
        userId: vendor.userId,
        vendorId,
        vendorApplicationId: applicationId,
        relatedUserIds: [],
        relatedVendorIds: [vendorId],
        storageObjects: [],
      };

      // Activation prerequisites are owned by vendor/Stripe/admin workflows.
      // Establish only their persisted downstream facts, never a test endpoint.
      const menu = await factory.prisma.menu.create({
        data: { vendorId, name: 'Lifecycle evidence menu', isActive: true },
      });
      await factory.prisma.vendor.update({
        where: { id: vendorId },
        data: {
          status: 'live',
          stripeAccountId: `acct_lifecycle_${applicationId.slice(0, 8)}`,
          payoutsEnabled: true,
          termsActivatedAt: new Date(),
          complianceStatus: 'RATED',
          fsaHygieneRating: 5,
        },
      });
      await factory.prisma.vendorTaxProfile.create({
        data: {
          vendorId,
          entityType: 'LIMITED_COMPANY',
          legalName: 'Lifecycle Public Kitchen Ltd',
          addressLine1: '1 Test Factory Way',
          city: 'London',
          postcode: 'SE15 4ST',
          companyNumber: '12345678',
          taxIdentifier: '1234567890',
        },
      });
      await factory.prisma.vendorDocument.create({
        data: {
          vendorId,
          type: 'hygiene_cert',
          status: 'verified',
          fileName: 'lifecycle-hygiene.pdf',
          fileUrl: 'https://example.invalid/test-factory/lifecycle-hygiene.pdf',
        },
      });
      itemId = (
        await factory.prisma.menuItem.create({
          data: {
            vendorId,
            menuId: menu.id,
            name: 'Lifecycle allergen dish',
            category: 'mains',
            pricePence: 1000,
            imageUrls: [],
            allergens: ['milk'],
            tags: ['test-fixture'],
            isAvailable: true,
          },
        })
      ).id;
      customer = await factory.create('C1');
      const order = await factory.prisma.order.create({
        data: {
          orderNumber: `TF-LIFE-${applicationId.slice(0, 8)}`,
          customerId: customer.userId,
          vendorId,
          type: 'standard',
          status: 'delivered',
          deliveryType: 'collection',
          subtotalPence: 1000,
          totalPence: 1000,
          commissionPence: 120,
          vendorPayoutPence: 880,
          allergenConfirmed: true,
          acceptedAt: new Date(),
          deliveredAt: new Date(),
          items: {
            create: {
              menuItemId: itemId,
              nameSnapshot: 'Lifecycle allergen dish',
              quantity: 1,
              unitPence: 1000,
              totalPence: 1000,
            },
          },
          payments: {
            create: {
              userId: customer.userId,
              type: 'capture',
              status: 'succeeded',
              amountPence: 1000,
              stripePaymentIntentId: `pi_lifecycle_${applicationId.slice(0, 8)}`,
              processedAt: new Date(),
            },
          },
        },
      });
      orderId = order.id;
      const payout = await factory.prisma.payout.create({
        data: {
          vendorId,
          orderId,
          status: 'transferred',
          amountPence: 880,
          grossPence: 1000,
          commissionPence: 120,
          periodStart: new Date('2030-01-01T00:00:00.000Z'),
          periodEnd: new Date('2030-01-07T00:00:00.000Z'),
          orderCount: 1,
          stripeTransferId: `tr_lifecycle_${applicationId.slice(0, 8)}`,
          transferredAt: new Date(),
        },
      });
      payoutId = payout.id;

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
        status: 'transferred',
        vendorId,
        orderId,
        amountPence: persistedOrder.vendorPayoutPence,
      });
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
