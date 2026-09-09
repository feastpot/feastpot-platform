/**
 * Part C cross-surface acceptance checks.
 *
 * These are deliberately HTTP-to-HTTP seams: a public/customer mutation is
 * made through its real controller, then the receiving operations surface is
 * read through its real, role-protected controller.  Prisma is used only to
 * identify and clean up the exact factory-owned records, never as a substitute
 * for the receiving-surface assertion.
 */
import { getQueueToken } from '@nestjs/bull';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Job, Queue } from 'bull';
import request from 'supertest';

import { TestDataFactory, type TestIdentity } from '../../../../scripts/test-factory';
import { RoleThrottlerGuard } from '../common/guards/role-throttler.guard';
import { EmailProvider } from '../modules/notifications/providers/email.provider';
import { PushProvider } from '../modules/notifications/providers/push.provider';
import { SmsProvider } from '../modules/notifications/providers/sms.provider';
import { WhatsappProvider } from '../modules/notifications/providers/whatsapp.provider';
import { StripeWebhookProcessor } from '../modules/payments/stripe-webhook.processor';
import { NOTIFICATIONS_QUEUE } from '../queues/queues.module';
import { STRIPE_CLIENT } from '../stripe/stripe.service';

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const required = [
  'SUPABASE_DB_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_FACTORY_PASSWORD',
] as const;
const provisioned = required.every((name) => process.env[name]) && Boolean(anonKey);

async function seedFailedNotification(queue: Queue, id: string): Promise<Job> {
  await queue.pause(false);
  const job = await queue.add(
    'cross_surface_notification_failure',
    { provenance: 'test-factory' },
    {
      jobId: id,
      attempts: 1,
      removeOnFail: false,
    },
  );
  const redis = queue.client;
  const removed =
    (await redis.lrem(queue.toKey('paused'), 0, String(job.id))) +
    (await redis.lrem(queue.toKey('wait'), 0, String(job.id)));
  if (removed !== 1) throw new Error('REVERSE_PROPAGATION_QUEUE_SEED_NOT_ISOLATED');
  await redis.lpush(queue.toKey('active'), String(job.id));
  await job.moveToFailed({ message: 'Intentional test-factory notification failure' }, true);
  if ((await job.getState()) !== 'failed') throw new Error('REVERSE_PROPAGATION_QUEUE_SEED_FAILED');
  return job;
}

(provisioned ? describe : describe.skip)(
  'cross-surface reverse propagation (factory-backed)',
  () => {
    let app: INestApplication;
    let factory: TestDataFactory;
    let admin: TestIdentity;
    let customer: TestIdentity;
    let vendor: TestIdentity;
    let adminToken: string;
    let customerToken: string;
    let vendorToken: string;
    const namespace = `reverse-propagation-${Date.now()}`;
    const originalFactoryNamespace = process.env.TEST_FACTORY_NAMESPACE;

    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

    beforeAll(async () => {
      // ComplianceService has a deliberate test-mode storage seam. Keep its
      // namespace exactly aligned with factory identities, then restore it.
      process.env.TEST_FACTORY_NAMESPACE = namespace;
      factory = TestDataFactory.fromEnvironment({ namespace });
      admin = await factory.create('A1');
      adminToken = await factory.issueAccessToken(admin);
      customer = await factory.create('C3');
      vendor = await factory.create('V4');
      customerToken = await factory.issueAccessToken(customer);
      vendorToken = await factory.issueAccessToken(vendor);

      const { AppModule } = await import('../app.module');
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(RoleThrottlerGuard)
        .useValue({ canActivate: () => true })
        .overrideProvider(ConfigService)
        .useValue(new ConfigService(process.env))
        .overrideProvider(EmailProvider)
        .useValue({ send: jest.fn().mockResolvedValue({ id: null, delivered: false }) })
        .overrideProvider(WhatsappProvider)
        .useValue({ send: jest.fn().mockResolvedValue({ id: null, delivered: false }) })
        .overrideProvider(SmsProvider)
        .useValue({ send: jest.fn().mockResolvedValue({ id: null, delivered: false }) })
        .overrideProvider(PushProvider)
        .useValue({ send: jest.fn().mockResolvedValue({ id: null, delivered: false }) })
        .overrideProvider(STRIPE_CLIENT)
        .useValue({})
        .compile();
      app = moduleRef.createNestApplication();
      app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
      );
      await app.init();
    }, 120_000);

    afterAll(async () => {
      try {
        // C3 owns the order used below. Its review must be removed before the
        // factory tears down that order on databases where reviews are restricted.
        if (customer?.orderId) {
          await factory.prisma.review.deleteMany({ where: { orderId: customer.orderId } });
        }
        await factory.prisma.cateringEnquiry.deleteMany({
          where: { email: { startsWith: `tf-${namespace}-catering-` } },
        });
        await factory.prisma.coverageInterest.deleteMany({
          where: { email: { startsWith: `tf-${namespace}-coverage-` } },
        });
        await factory.prisma.chargeback.deleteMany({
          where: { stripeDisputeId: { startsWith: `dp_tf_${namespace.replace(/-/g, '_')}_` } },
        });
        await factory.prisma.processedWebhookEvent.deleteMany({
          where: { stripeEventId: { startsWith: `evt_tf_${namespace.replace(/-/g, '_')}_` } },
        });
        await Promise.all(
          [customer, vendor, admin].filter(Boolean).map((identity) => factory.teardown(identity)),
        );
      } finally {
        if (originalFactoryNamespace === undefined) delete process.env.TEST_FACTORY_NAMESPACE;
        else process.env.TEST_FACTORY_NAMESPACE = originalFactoryNamespace;
        await app?.close();
        await factory?.dispose();
      }
    }, 120_000);

    it('carries an uncovered-postcode signup from the public form to the admin coverage waitlist', async () => {
      const email = `tf-${namespace}-coverage-${Date.now()}@test.feastpot.co.uk`;
      const postcode = 'ZZ1 1ZZ';

      await request(app.getHttpServer())
        .post('/v1/coverage-interest')
        .send({ email, postcode, name: 'Coverage Acceptance', marketingConsent: true })
        .expect(201)
        .expect({ ok: true });

      const receivingSurface = await request(app.getHttpServer())
        .get(`/v1/admin/coverage-interest?postcode=${encodeURIComponent(postcode)}&limit=20`)
        .set(auth(adminToken))
        .expect(200);

      expect(receivingSurface.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            email,
            postcode,
            name: 'Coverage Acceptance',
            marketingConsent: true,
            source: 'coverage-check',
            notified: false,
          }),
        ]),
      );
      const persisted = await factory.prisma.coverageInterest.findUniqueOrThrow({
        where: { email_postcode: { email, postcode } },
      });
      expect(persisted.id).toEqual(expect.any(String));
    }, 30_000);

    it('carries a public catering enquiry to operations with its new-enquiry SLA clock intact', async () => {
      const email = `tf-${namespace}-catering-${Date.now()}@test.feastpot.co.uk`;
      const submittedAt = Date.now();
      await request(app.getHttpServer())
        .post('/v1/catering-enquiries')
        .send({
          occasionType: 'birthday-party',
          guestCountBand: '26-50',
          cuisineStyle: 'Nigerian',
          postcode: 'SE15 4EE',
          eventDate: '2030-12-25',
          contactName: 'Catering Acceptance',
          email,
          source: 'cross-surface-acceptance',
        })
        .expect(201)
        .expect({ ok: true });

      const receivingSurface = await request(app.getHttpServer())
        .get('/v1/catering-enquiries?includeTestData=true&limit=100')
        .set(auth(adminToken))
        .expect(200);
      const enquiry = receivingSurface.body.data.find(
        (row: { email: string }) => row.email === email,
      );
      expect(enquiry).toMatchObject({
        email,
        postcode: 'SE15 4EE',
        status: 'NEW',
        source: 'cross-surface-acceptance',
      });
      // The receiving surface derives SLA from this persisted creation timestamp;
      // a new item must be inside the first 24-hour response window.
      expect(new Date(enquiry.createdAt).getTime()).toBeGreaterThanOrEqual(submittedAt - 1_000);
      expect(Date.now() - new Date(enquiry.createdAt).getTime()).toBeLessThan(24 * 60 * 60 * 1_000);
    }, 30_000);

    it('carries a customer review to the operations moderation queue', async () => {
      expect(customer.orderId).toBeDefined();
      const created = await request(app.getHttpServer())
        .post('/v1/reviews')
        .set(auth(customerToken))
        .send({
          orderId: customer.orderId,
          rating: 5,
          title: 'Cross-surface acceptance review',
          body: 'The delivered order was excellent and this text is safe for automatic moderation.',
        })
        .expect(201);

      const receivingSurface = await request(app.getHttpServer())
        .get('/v1/reviews/moderation-queue?status=all&limit=100')
        .set(auth(adminToken))
        .expect(200);
      expect(receivingSurface.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: created.body.id,
            customer: expect.objectContaining({ id: customer.userId }),
            title: 'Cross-surface acceptance review',
          }),
        ]),
      );
    }, 30_000);

    it('carries a vendor document to the compliance receiving surface using test-mode storage', async () => {
      expect(vendor.vendorId).toBeDefined();
      const uploaded = await request(app.getHttpServer())
        .post(`/v1/vendors/${vendor.vendorId}/documents`)
        .set(auth(vendorToken))
        .field('type', 'insurance')
        .field('expiresAt', '2030-12-25T00:00:00.000Z')
        .attach('file', Buffer.from('factory compliance evidence'), {
          filename: 'cross-surface-insurance.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      const receivingSurface = await request(app.getHttpServer())
        .get(`/v1/vendors/${vendor.vendorId}/documents`)
        .set(auth(adminToken))
        .expect(200);
      expect(receivingSurface.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: uploaded.body.id,
            type: 'insurance',
            status: 'pending',
            fileName: 'cross-surface-insurance.pdf',
            fileUrl: expect.stringContaining('https://test-storage.invalid/'),
          }),
        ]),
      );
    }, 30_000);

    it('carries a vendor-created item to the menu moderation queue', async () => {
      expect(vendor.vendorId).toBeDefined();
      const menu = await request(app.getHttpServer())
        .post(`/v1/vendors/${vendor.vendorId}/menus`)
        .set(auth(vendorToken))
        .send({ name: 'Cross-surface menu', isActive: true })
        .expect(201);
      const item = await request(app.getHttpServer())
        .post(`/v1/vendors/${vendor.vendorId}/menus/${menu.body.id}/items`)
        .set(auth(vendorToken))
        .send({
          name: 'Cross-surface jollof',
          category: 'Mains',
          basePricePence: 1500,
          prepTimeMinutes: 30,
          allergensFreeFrom: true,
        })
        .expect(201);
      const receivingSurface = await request(app.getHttpServer())
        .get('/v1/admin/menu-items/moderation-queue?status=all&limit=100')
        .set(auth(adminToken))
        .expect(200);
      expect(receivingSurface.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: item.body.id,
            name: 'Cross-surface jollof',
            vendorId: vendor.vendorId,
          }),
        ]),
      );
    }, 30_000);

    it('carries a failed notification job to the administrator dead-letter surface', async () => {
      const queue = app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));
      const jobId = `test-factory:reverse-propagation:${Date.now()}`;
      let job: Job | undefined;
      try {
        job = await seedFailedNotification(queue, jobId);
        const receivingSurface = await request(app.getHttpServer())
          .get(`/v1/admin/dead-letters?queue=${encodeURIComponent(NOTIFICATIONS_QUEUE)}`)
          .set(auth(adminToken))
          .expect(200);
        expect(receivingSurface.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              queue: NOTIFICATIONS_QUEUE,
              id: String(job.id),
              name: 'cross_surface_notification_failure',
              failedReason: 'Intentional test-factory notification failure',
            }),
          ]),
        );
      } finally {
        await job?.remove().catch(() => undefined);
        await queue.resume(true);
      }
    }, 30_000);

    it('carries a test-mode Stripe dispute delivery to finance chargebacks with its evidence deadline', async () => {
      const suffix = Date.now();
      const eventId = `evt_tf_${namespace.replace(/-/g, '_')}_${suffix}`;
      const disputeId = `dp_tf_${namespace.replace(/-/g, '_')}_${suffix}`;
      const dueBy = Math.floor((Date.now() + 72 * 60 * 60 * 1_000) / 1_000);
      await factory.prisma.processedWebhookEvent.create({
        data: {
          stripeEventId: eventId,
          eventType: 'charge.dispute.created',
          payload: { testFactory: true },
          status: 'claimed',
        },
      });
      // This is the worker's deliberately isolated test-mode input seam: no
      // Stripe network call is made, but the real idempotency claim and real
      // charge.dispute.created processor write the finance-facing record.
      const job = {
        data: {
          id: eventId,
          type: 'charge.dispute.created',
          data: {
            id: disputeId,
            amount: 1750,
            currency: 'gbp',
            status: 'needs_response',
            reason: 'fraudulent',
            created: Math.floor(Date.now() / 1_000),
            charge: `ch_tf_${suffix}`,
            payment_intent: `pi_tf_${suffix}`,
            evidence_details: { due_by: dueBy },
          },
        },
      };
      await app.get(StripeWebhookProcessor).onDisputeCreated(job as never);

      const receivingSurface = await request(app.getHttpServer())
        .get(`/v1/payments/chargebacks?status=needs_response&limit=100`)
        .set(auth(adminToken))
        .expect(200);
      expect(receivingSurface.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            stripeDisputeId: disputeId,
            amountPence: 1750,
            currency: 'GBP',
            status: 'needs_response',
            evidenceDueBy: new Date(dueBy * 1_000).toISOString(),
          }),
        ]),
      );
    }, 30_000);
  },
);
