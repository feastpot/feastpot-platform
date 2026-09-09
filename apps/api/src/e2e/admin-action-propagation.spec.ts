/**
 * Part B cross-surface contract tests.
 *
 * These tests intentionally use the API as each receiving surface: the public
 * catalogue/search is the customer contract and authenticated vendor routes are
 * the vendor contract.  The factory keeps every row isolated and tear-downable.
 */
import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bull';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ModerationStatus, type OrderCommission } from '@prisma/client';
import type { Job, Queue } from 'bull';
import request from 'supertest';

import { TestDataFactory, type TestIdentity } from '../../../../scripts/test-factory';
import { RoleThrottlerGuard } from '../common/guards/role-throttler.guard';
import { EmailProvider } from '../modules/notifications/providers/email.provider';
import { PushProvider } from '../modules/notifications/providers/push.provider';
import { SmsProvider } from '../modules/notifications/providers/sms.provider';
import { WhatsappProvider } from '../modules/notifications/providers/whatsapp.provider';
import { TermsNoticeProcessor } from '../modules/terms/terms-notice.processor';
import {
  GENERATE_ACCEPTANCE_PDF_JOB,
  SEND_TERMS_NOTICES_JOB,
  buildVendorTermsAcceptanceLabel,
} from '../modules/terms/terms.service';
import { VendorVerificationService } from '../modules/vendor-verification/vendor-verification.service';
import { TERMS_NOTICES_QUEUE } from '../queues/queues.module';
import { STRIPE_CLIENT } from '../stripe/stripe.service';

const required = [
  'SUPABASE_DB_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_FACTORY_PASSWORD',
];
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const configured = required.every((name) => Boolean(process.env[name])) && Boolean(anonKey);
const testFactoryNamespace = `${Date.now()}-part-b-actions`;
const originalTestFactoryNamespace = process.env.TEST_FACTORY_NAMESPACE;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const days = (count: number) => new Date(Date.now() + count * 86_400_000);
const waitFor = async <T>(read: () => Promise<T | null>, label: string): Promise<T> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`PART_B_PROPAGATION_TIMEOUT: ${label}`);
};

(configured ? describe : describe.skip)(
  'Part B admin action propagation (factory-backed API contracts)',
  () => {
    let app: INestApplication;
    let factory: TestDataFactory;
    let termsNoticesQueue: Queue;
    let termsNoticesQueuePausedBySuite = false;
    let admin: TestIdentity;
    let compliance: TestIdentity;
    let applicant: TestIdentity;
    let liveVendor: TestIdentity;
    let moderationVendor: TestIdentity;
    let customer: TestIdentity;
    let adminToken: string;
    let complianceToken: string;
    let vendorToken: string;
    let moderationVendorToken: string;
    let customerToken: string;
    let publishedTermsId: string;
    let scheduledRateId: string;
    let scheduledRatePercent: number;
    let originalRateId: string;
    let rateTermsVersionId: string | undefined;
    let createdApplicationId: string | undefined;
    let earlierCommission: OrderCommission | null;

    beforeAll(async () => {
      process.env.TEST_FACTORY_NAMESPACE = testFactoryNamespace;
      factory = TestDataFactory.fromEnvironment({ namespace: testFactoryNamespace });
      admin = await factory.create('A1');
      compliance = await factory.create('A5');
      applicant = await factory.create('V1');
      liveVendor = await factory.create('V9');
      moderationVendor = await factory.create('V4');
      customer = await factory.create('C3');
      [adminToken, complianceToken, vendorToken, moderationVendorToken, customerToken] =
        await Promise.all([
          factory.issueAccessToken(admin),
          factory.issueAccessToken(compliance),
          factory.issueAccessToken(liveVendor),
          factory.issueAccessToken(moderationVendor),
          factory.issueAccessToken(customer),
        ]);
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
        .useValue({
          paymentIntents: {
            create: jest.fn().mockImplementation(async ({ amount }: { amount: number }) => ({
              id: `pi_part_b_${randomUUID()}`,
              amount,
              client_secret: 'pi_part_b_secret',
              status: 'requires_capture',
            })),
          },
          refunds: {
            create: jest.fn().mockImplementation(async () => ({
              id: `re_part_b_${randomUUID()}`,
              charge: `ch_part_b_${randomUUID()}`,
              status: 'succeeded',
            })),
          },
          transfers: {
            createReversal: jest.fn().mockImplementation(async () => ({
              id: `trr_part_b_${randomUUID()}`,
            })),
            create: jest.fn().mockImplementation(async () => ({
              id: `tr_part_b_${randomUUID()}`,
            })),
          },
        })
        .compile();
      termsNoticesQueue = moduleRef.get<Queue>(getQueueToken(TERMS_NOTICES_QUEUE));
      app = moduleRef.createNestApplication();
      app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
      );
      await app.init();
    }, 240_000);

    const pauseTermsNoticesQueue = async () => {
      if (!(await termsNoticesQueue.isPaused())) {
        await termsNoticesQueue.pause();
        termsNoticesQueuePausedBySuite = true;
      }
    };

    const removeTestVersionNoticeJob = async (termsVersionId: string) => {
      const job = await waitFor<Job>(async () => {
        const jobs = await termsNoticesQueue.getJobs(['waiting', 'delayed', 'paused']);
        return (
          jobs.find(
            (candidate) =>
              candidate.name === SEND_TERMS_NOTICES_JOB &&
              candidate.data?.termsVersionId === termsVersionId,
          ) ?? null
        );
      }, `queued terms notice job for ${termsVersionId}`);
      const duplicates = (await termsNoticesQueue.getJobs(['waiting', 'delayed', 'paused'])).filter(
        (candidate) =>
          candidate.name === SEND_TERMS_NOTICES_JOB &&
          candidate.data?.termsVersionId === termsVersionId,
      );
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]?.id).toBe(job.id);
      await job.remove();
    };

    const restoreTermsNoticesQueue = async () => {
      if (termsNoticesQueuePausedBySuite) {
        await termsNoticesQueue.resume();
        termsNoticesQueuePausedBySuite = false;
      }
    };

    afterAll(async () => {
      try {
        const automaticallyPublishedRateTerms = admin
          ? await factory.prisma.termsVersion.findMany({
              where: { documentType: 'RATE_SCHEDULE', createdBy: admin.userId },
              select: { id: true },
            })
          : [];
        const termsVersionIds = [
          ...new Set([
            publishedTermsId,
            rateTermsVersionId,
            ...automaticallyPublishedRateTerms.map((row) => row.id),
          ]),
        ].filter((id): id is string => Boolean(id));
        if (termsVersionIds.length > 0) {
          await factory.prisma.termsAcceptance.deleteMany({
            where: { termsVersionId: { in: termsVersionIds } },
          });
          await factory.prisma.termsNotice.deleteMany({
            where: { termsVersionId: { in: termsVersionIds } },
          });
          await factory.prisma.rateScheduleEntry.deleteMany({
            where: { versionId: { in: termsVersionIds } },
          });
          await factory.prisma.termsVersion.deleteMany({ where: { id: { in: termsVersionIds } } });
        }
        if (scheduledRateId) {
          await factory.prisma.commissionRate.deleteMany({ where: { id: scheduledRateId } });
        }
        if (originalRateId) {
          await factory.prisma.commissionRate.update({
            where: { id: originalRateId },
            data: { effectiveTo: null },
          });
        }
        if (createdApplicationId) {
          await factory.prisma.vendorApplication.deleteMany({
            where: { id: createdApplicationId },
          });
        }
        for (const identity of [
          customer,
          moderationVendor,
          liveVendor,
          applicant,
          compliance,
          admin,
        ].filter(Boolean)) {
          await factory.teardown(identity);
        }
      } finally {
        await restoreTermsNoticesQueue();
        await app?.close();
        await factory?.dispose();
        if (originalTestFactoryNamespace === undefined) {
          delete process.env.TEST_FACTORY_NAMESPACE;
        } else {
          process.env.TEST_FACTORY_NAMESPACE = originalTestFactoryNamespace;
        }
      }
    }, 240_000);

    it('approves an applicant, who can sign in to the vendor setup contract, while a live vendor is customer-discoverable', async () => {
      const seed = await factory.prisma.vendorApplication.findUniqueOrThrow({
        where: { id: applicant.vendorApplicationId! },
      });
      await factory.teardown(applicant);
      const application = await factory.prisma.vendorApplication.create({
        data: {
          fullName: seed.fullName,
          kitchenName: seed.kitchenName,
          email: seed.email,
          phone: `07${String(Date.now()).slice(-9)}`,
          postcode: seed.postcode,
          cuisineType: seed.cuisineType,
          kitchenType: seed.kitchenType,
          hasFsaRegistration: seed.hasFsaRegistration,
          foodStory: seed.foodStory,
          marketingConsent: seed.marketingConsent,
          acceptedTermsAt: seed.acceptedTermsAt,
          acceptedTermsVersion: seed.acceptedTermsVersion,
          submittedAt: new Date(),
          cuisineTypes: [seed.cuisineType],
          occasionSlugs: ['weddings'],
          menuPhotoUrl: 'https://example.test/menu.jpg',
          menuPhotoPath: 'test-factory/menu.jpg',
          isTestData: true,
        },
      });
      createdApplicationId = application.id;
      const approved = await request(app.getHttpServer())
        .patch(`/v1/admin/vendor-applications/${application.id}`)
        .set(auth(complianceToken))
        .send({ status: 'approved', sendInvite: true })
        .expect(200);
      const provisioned = await factory.prisma.vendorApplication.findUniqueOrThrow({
        where: { id: application.id },
      });
      expect(provisioned.vendorId).toEqual(expect.any(String));
      const approvedVendor = await factory.prisma.vendor.findUniqueOrThrow({
        where: { id: provisioned.vendorId! },
      });
      await factory.setTestPassword(approvedVendor.userId);
      const token = await factory.issueAccessToken({
        ...applicant,
        credentials: {
          ...applicant.credentials,
          email: seed.email,
          password: process.env.TEST_FACTORY_PASSWORD!,
        },
      });
      await request(app.getHttpServer())
        .get('/v1/vendors/me/onboarding-progress')
        .set(auth(token))
        .expect(200);
      const termsStatus = await request(app.getHttpServer())
        .get('/v1/terms/acceptance-status')
        .set(auth(token))
        .expect(200);
      if (!termsStatus.body.accepted) {
        expect(termsStatus.body).toEqual(
          expect.objectContaining({
            currentVersionId: expect.any(String),
            currentVersion: expect.any(String),
          }),
        );
        await pauseTermsNoticesQueue();
        const acceptance = await request(app.getHttpServer())
          .post(`/v1/terms/versions/${termsStatus.body.currentVersionId}/accept`)
          .set(auth(token))
          .set('User-Agent', 'Feastpot cross-surface acceptance test')
          .send({
            acceptanceText: buildVendorTermsAcceptanceLabel(termsStatus.body.currentVersion),
            scrolledToEnd: true,
          })
          .expect(200);
        expect(acceptance.body).toEqual({ ok: true });
        const acceptanceRecord = await factory.prisma.termsAcceptance.findUniqueOrThrow({
          where: {
            vendorId_termsVersionId: {
              vendorId: approvedVendor.id,
              termsVersionId: termsStatus.body.currentVersionId,
            },
          },
        });
        const acceptancePdfJob = await waitFor<Job>(
          async () =>
            (await termsNoticesQueue.getJob(`terms-acceptance-pdf:${acceptanceRecord.id}`)) ?? null,
          `queued ${GENERATE_ACCEPTANCE_PDF_JOB} job for ${acceptanceRecord.id}`,
        );
        expect(acceptancePdfJob.name).toBe(GENERATE_ACCEPTANCE_PDF_JOB);
        await acceptancePdfJob.remove();
      }
      await request(app.getHttpServer())
        .put('/v1/vendors/me/tax-profile')
        .set(auth(token))
        .send({
          entityType: 'SOLE_TRADER',
          legalName: seed.fullName,
          addressLine1: '1 Factory Acceptance Street',
          city: 'London',
          postcode: application.postcode,
          country: 'GB',
          dateOfBirth: '1990-01-01',
          taxIdentifier: `TF${String(Date.now()).slice(-8)}`,
          taxIdCountry: 'GB',
        })
        .expect(200);
      await request(app.getHttpServer())
        .put('/v1/vendors/me/delivery-config')
        .set(auth(token))
        .send({
          types: ['local', 'collection'],
          localRadiusMiles: 5,
          localFeePence: 0,
          minOrderPence: 0,
          postcodes: [application.postcode],
          kitchenPostcode: application.postcode,
          collectionLine1: '1 Factory Acceptance Street',
          collectionTown: 'London',
          collectionPostcode: application.postcode,
        })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/v1/vendors/${approvedVendor.id}/compliance`)
        .set(auth(complianceToken))
        .send({
          complianceStatus: 'RATED',
          fsaHygieneRating: 5,
          fsaRatingDate: new Date().toISOString(),
          fsaRegistrationNumber: `TF-FSA-${String(Date.now()).slice(-8)}`,
          fsaLastChecked: new Date().toISOString(),
        })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/v1/vendors/${approvedVendor.id}/status`)
        .set(auth(adminToken))
        .send({
          status: 'live',
          reasonCode: 'SETUP_COMPLETE',
          notes: 'Applicant completed the required setup and was activated for acceptance testing.',
        })
        .expect(200);
      const publicProfile = await request(app.getHttpServer())
        .get(`/v1/vendors/${approvedVendor.slug}`)
        .expect(200);
      expect(publicProfile.body.id).toBe(approvedVendor.id);
      const postcodeSearch = await request(app.getHttpServer())
        .get('/v1/vendors')
        .query({ postcode: application.postcode, q: approvedVendor.businessName })
        .expect(200);
      expect(postcodeSearch.body.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: approvedVendor.id })]),
      );
      expect(approved.body.status).toBe('approved');
    }, 60_000);

    it('propagates suspension and low FHRS to the public customer search and provides a vendor reason/appeal contract', async () => {
      const endpoint = `/v1/admin/vendors/${liveVendor.vendorId!}/enforcement`;
      await request(app.getHttpServer())
        .post(endpoint)
        .set(auth(complianceToken))
        .send({
          actionType: 'SUSPENSION',
          reasonCode: 'FRAUD',
          reasonNarrative:
            'The independent compliance review recorded dated evidence, proportionality, and the vendor response.',
          effectiveAt: new Date().toISOString(),
          urgentBasis: 'Immediate customer safety protection is necessary.',
        })
        .expect(201);
      const vendorEvidence = await request(app.getHttpServer())
        .get('/v1/vendors/me/enforcement')
        .set(auth(vendorToken))
        .expect(200);
      expect(vendorEvidence.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            reasonCode: 'FRAUD',
            reasonNarrative: expect.stringContaining('independent compliance review'),
            appealClause: '18.1',
            appealDeadline: expect.any(String),
            appealRoute: {
              method: 'email',
              address: 'appeals@feastpot.co.uk',
            },
          }),
        ]),
      );
      const hidden = await request(app.getHttpServer())
        .get('/v1/vendors')
        .query({ postcode: 'SE15 4ST' })
        .expect(200);
      expect(JSON.stringify(hidden.body)).not.toContain(liveVendor.vendorId!);

      const fhrsVendor = await factory.create('V6');
      try {
        await request(app.getHttpServer())
          .put(`/v1/admin/vendors/${fhrsVendor.vendorId!}/verification`)
          .set(auth(complianceToken))
          .send({
            registrationNumber: `TF-${Date.now()}`,
            registrationAuthority: 'Test authority',
            registrationConfirmedAt: new Date().toISOString(),
            fhrsRating: 2,
            fhrsRatingCheckedAt: new Date().toISOString(),
            fhrsInspectionStatus: 'RATED',
            allergenTrainingHeld: true,
            overallState: 'VERIFIED',
          })
          .expect(200);
        await app.get(VendorVerificationService).runVerificationScan();
        await expect(
          factory.prisma.vendor.findUniqueOrThrow({ where: { id: fhrsVendor.vendorId! } }),
        ).resolves.toMatchObject({ status: 'suspended' });
        expect(
          JSON.stringify(
            (await request(app.getHttpServer()).get('/v1/vendors').query({ postcode: 'SE15 4ST' }))
              .body,
          ),
        ).not.toContain(fhrsVendor.vendorId!);
      } finally {
        await factory.teardown(fhrsVendor);
      }
    }, 60_000);

    it('marks an expiring document renewal-due, then suspends it after day seven and removes its customer listing', async () => {
      const documentVendor = await factory.create('V6');
      const verification = {
        registrationNumber: `TF-doc-${Date.now()}`,
        registrationAuthority: 'Test authority',
        registrationConfirmedAt: new Date().toISOString(),
        fhrsRating: 5,
        fhrsRatingCheckedAt: new Date().toISOString(),
        fhrsInspectionStatus: 'RATED',
        allergenTrainingHeld: true,
        overallState: 'VERIFIED',
      };
      try {
        await request(app.getHttpServer())
          .put(`/v1/admin/vendors/${documentVendor.vendorId!}/verification`)
          .set(auth(complianceToken))
          .send({
            ...verification,
            insuranceProvider: 'Test insurer',
            insuranceValidUntil: days(14).toISOString(),
          })
          .expect(200);
        await app.get(VendorVerificationService).runVerificationScan();
        const renewalReceiver = await request(app.getHttpServer())
          .get(`/v1/vendors/${documentVendor.vendorId!}/verification`)
          .set(auth(await factory.issueAccessToken(documentVendor)))
          .expect(200);
        expect(renewalReceiver.body).toMatchObject({ overallState: 'RENEWAL_DUE' });
        await request(app.getHttpServer())
          .put(`/v1/admin/vendors/${documentVendor.vendorId!}/verification`)
          .set(auth(complianceToken))
          .send({
            ...verification,
            insuranceProvider: 'Test insurer',
            insuranceValidUntil: days(-8).toISOString(),
          })
          .expect(200);
        await app.get(VendorVerificationService).runVerificationScan();
        await expect(
          factory.prisma.vendor.findUniqueOrThrow({ where: { id: documentVendor.vendorId! } }),
        ).resolves.toMatchObject({ status: 'suspended' });
        expect(
          JSON.stringify(
            (await request(app.getHttpServer()).get('/v1/vendors').query({ postcode: 'SE15 4ST' }))
              .body,
          ),
        ).not.toContain(documentVendor.vendorId!);
      } finally {
        await factory.teardown(documentVendor);
      }
    }, 60_000);

    it('publishes terms and commission notices into the vendor contract, preserving historical order commission snapshots', async () => {
      await pauseTermsNoticesQueue();
      const version = `part-b-${Date.now()}`;
      const effectiveAt = days(16);
      const published = await request(app.getHttpServer())
        .post('/v1/terms/versions')
        .set(auth(adminToken))
        .send({
          documentType: 'VENDOR_TERMS',
          version,
          contentMdx: '# Part B terms\nMaterial rate notice.',
          changeSummary: 'Commission schedule amendment.',
          isMaterial: true,
          effectiveAt: effectiveAt.toISOString(),
          createdBy: admin.credentials.email,
          solicitorSignOff: 'Approved by Test Solicitor on 2026-01-01',
        })
        .expect(201);
      publishedTermsId = published.body.id;
      await removeTestVersionNoticeJob(publishedTermsId);
      await app.get(TermsNoticeProcessor).handleSendNotices({
        data: {
          termsVersionId: publishedTermsId,
          targetVendorId: liveVendor.vendorId!,
          testFactoryNamespace,
        },
      } as never);
      const notices = await request(app.getHttpServer())
        .get('/v1/terms/notices')
        .set(auth(vendorToken))
        .expect(200);
      expect(notices.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            termsVersion: expect.objectContaining({
              version,
              effectiveAt: effectiveAt.toISOString(),
            }),
          }),
        ]),
      );
      const banner = notices.body.find(
        (notice: { termsVersion: { id: string } }) => notice.termsVersion.id === publishedTermsId,
      );
      expect(
        Math.ceil((new Date(banner.termsVersion.effectiveAt).getTime() - Date.now()) / 86_400_000),
      ).toBe(16);
      earlierCommission = await factory.prisma.orderCommission.findFirst({
        where: { orderId: customer.orderId! },
      });
      const current = await factory.prisma.commissionRate.findFirstOrThrow({
        where: { source: 'MARKETPLACE', isFirstOrder: true, effectiveTo: null },
      });
      originalRateId = current.id;
      scheduledRatePercent = Number(current.ratePercent) + 0.01;
      const rateEffectiveAt = days(16 + (Date.now() % 1000));
      const scheduled = await request(app.getHttpServer())
        .post('/v1/admin/commission-rates')
        .set(auth(adminToken))
        .send({
          source: 'MARKETPLACE',
          isFirstOrder: current.isFirstOrder,
          ratePercent: scheduledRatePercent,
          effectiveFrom: rateEffectiveAt.toISOString(),
          note: `part-b notice ${version}`,
        })
        .expect(201);
      scheduledRateId = scheduled.body.id;
      const rateTermsVersion = await waitFor(
        () =>
          factory.prisma.termsVersion.findUnique({
            where: {
              documentType_version: {
                documentType: 'RATE_SCHEDULE',
                version: `RS-${rateEffectiveAt.toISOString().slice(0, 10)}`,
              },
            },
          }),
        'commission rate terms version',
      );
      rateTermsVersionId = rateTermsVersion.id;
      await removeTestVersionNoticeJob(rateTermsVersion.id);
      await app.get(TermsNoticeProcessor).handleSendNotices({
        data: {
          termsVersionId: rateTermsVersion.id,
          targetVendorId: liveVendor.vendorId!,
          testFactoryNamespace,
        },
      } as never);
      const rateNotices = await request(app.getHttpServer())
        .get('/v1/terms/notices')
        .set(auth(vendorToken))
        .expect(200);
      expect(rateNotices.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            termsVersion: expect.objectContaining({
              id: rateTermsVersion.id,
              effectiveAt: rateEffectiveAt.toISOString(),
            }),
          }),
        ]),
      );
      await restoreTermsNoticesQueue();
      expect(
        (await request(app.getHttpServer()).get('/v1/terms/rate-schedule').expect(200)).body,
      ).toBeDefined();
      expect(
        await factory.prisma.orderCommission.findFirst({ where: { orderId: customer.orderId! } }),
      ).toEqual(earlierCommission);
    }, 45_000);

    it('prompts the vendor to re-accept once the published material terms become effective', async () => {
      await factory.prisma.termsVersion.update({
        where: { id: publishedTermsId },
        data: { effectiveAt: new Date(Date.now() - 1_000) },
      });
      const status = await request(app.getHttpServer())
        .get('/v1/terms/acceptance-status')
        .set(auth(vendorToken))
        .expect(200);
      expect(status.body).toMatchObject({
        accepted: false,
        currentVersionId: publishedTermsId,
      });
      const vendorView = await request(app.getHttpServer())
        .get('/v1/terms/versions/me')
        .set(auth(vendorToken))
        .expect(200);
      expect(vendorView.body.current).toMatchObject({ id: publishedTermsId, accepted: false });
    }, 30_000);

    it('applies the newly effective commission to a new order without rewriting the earlier order snapshot', async () => {
      const orderCustomer = await factory.create('C2');
      try {
        await factory.prisma.vendor.update({
          where: { id: liveVendor.vendorId! },
          data: { status: 'live', suspendedAt: null },
        });
        await factory.prisma.commissionRate.update({
          where: { id: scheduledRateId },
          data: { effectiveFrom: new Date(Date.now() - 1_000) },
        });
        const orderCustomerToken = await factory.issueAccessToken(orderCustomer);
        const created = await request(app.getHttpServer())
          .post('/v1/orders')
          .set(auth(orderCustomerToken))
          .send({
            vendorId: liveVendor.vendorId,
            items: [{ menuItemId: liveVendor.menuItemId, quantity: 1 }],
            deliveryAddressId: orderCustomer.addressId,
            scheduledFor: days(2).toISOString(),
            allergenConfirmed: true,
          })
          .expect(201);
        const newSnapshot = await factory.prisma.orderCommission.findUniqueOrThrow({
          where: { orderId: created.body.order.id },
        });
        expect(newSnapshot.commissionRateId).toBe(scheduledRateId);
        expect(Number(newSnapshot.ratePercent)).toBe(scheduledRatePercent);
        expect(
          await factory.prisma.orderCommission.findFirst({ where: { orderId: customer.orderId! } }),
        ).toEqual(earlierCommission);
      } finally {
        await factory.teardown(orderCustomer);
      }
    }, 60_000);

    it('refunds through the admin API and exposes the customer status, vendor payout deduction, and balanced ledger pair', async () => {
      const order = await factory.prisma.order.findUniqueOrThrow({
        where: { id: customer.orderId! },
        include: { vendor: { include: { user: true } } },
      });
      const capture = await factory.prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });
      await factory.prisma.payment.update({
        where: { id: capture.id },
        data: { status: 'succeeded', stripePaymentIntentId: `pi_part_b_capture_${randomUUID()}` },
      });
      const payout = await factory.prisma.payout.create({
        data: {
          vendorId: order.vendorId,
          orderId: order.id,
          amountPence: order.vendorPayoutPence,
          grossPence: order.subtotalPence + order.deliveryFeePence,
          commissionPence: order.commissionPence,
          refundsPence: 0,
          status: 'draft',
          periodStart: days(-7),
          periodEnd: days(1),
          orderCount: 1,
        },
      });
      const vendorReceiverToken = await factory.issueAccessToken({
        state: 'V5',
        credentials: {
          email: order.vendor.user.email,
          password: process.env.TEST_FACTORY_PASSWORD!,
          role: 'vendor',
        },
        userId: order.vendor.userId,
        vendorId: order.vendorId,
        relatedUserIds: [],
        relatedVendorIds: [],
        storageObjects: [],
      });
      await request(app.getHttpServer())
        .post(`/v1/admin/orders/${order.id}/refunds`)
        .set(auth(adminToken))
        .send({ reason: 'customer_complaint', requestId: randomUUID() })
        .expect(201);
      const customerContract = await request(app.getHttpServer())
        .get('/v1/orders')
        .set(auth(customerToken))
        .expect(200);
      expect(customerContract.body.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: order.id, status: 'refunded' })]),
      );
      const vendorContract = await request(app.getHttpServer())
        .get('/v1/orders')
        .set(auth(vendorReceiverToken))
        .expect(200);
      expect(vendorContract.body.data).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: order.id, status: 'refunded' })]),
      );
      const payoutContract = await request(app.getHttpServer())
        .get(`/v1/payouts/${payout.id}`)
        .set(auth(vendorReceiverToken))
        .expect(200);
      expect(payoutContract.body).toMatchObject({
        id: payout.id,
        amountPence: 0,
        refundsPence: order.vendorPayoutPence,
      });
      const [adjustedPayout, ledger] = await Promise.all([
        factory.prisma.payout.findUniqueOrThrow({ where: { id: payout.id } }),
        factory.prisma.payment.findMany({
          where: { orderId: order.id, type: { in: ['refund', 'credit'] } },
          orderBy: { createdAt: 'asc' },
        }),
      ]);
      expect(adjustedPayout.amountPence).toBe(0);
      expect(adjustedPayout.refundsPence).toBe(order.vendorPayoutPence);
      expect(ledger.map((entry) => entry.type)).toEqual(
        expect.arrayContaining(['refund', 'credit']),
      );
      expect(ledger.reduce((sum, entry) => sum + entry.amountPence, 0)).toBe(
        -order.vendorPayoutPence,
      );
    }, 60_000);

    it('makes approval public, keeps rejection private with its reason, and propagates dispute outcomes to both contracts', async () => {
      const menu =
        (await factory.prisma.menu.findFirst({
          where: { vendorId: moderationVendor.vendorId! },
        })) ??
        (await factory.prisma.menu.create({
          data: {
            vendorId: moderationVendor.vendorId!,
            name: 'Part B moderation menu',
            isActive: true,
          },
        }));
      const held = await factory.prisma.menuItem.create({
        data: {
          vendorId: moderationVendor.vendorId!,
          menuId: menu.id,
          name: `Approved ${Date.now()}`,
          description: 'Factory moderation item.',
          category: 'mains',
          pricePence: 500,
          imageUrls: [],
          allergens: ['milk'],
          tags: [],
          isAvailable: true,
          moderationStatus: 'held',
        },
      });
      const rejected = await factory.prisma.menuItem.create({
        data: {
          vendorId: moderationVendor.vendorId!,
          menuId: menu.id,
          name: `Rejected ${Date.now()}`,
          description: 'Factory moderation item.',
          category: 'mains',
          pricePence: 500,
          imageUrls: [],
          allergens: [],
          tags: [],
          isAvailable: true,
          moderationStatus: 'held',
        },
      });
      await request(app.getHttpServer())
        .patch(`/v1/admin/menu-items/${held.id}/moderation`)
        .set(auth(adminToken))
        .send({ status: 'approved', expectedStatus: 'held', expectedSubmissionVersion: 1 })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/v1/admin/menu-items/${rejected.id}/moderation`)
        .set(auth(adminToken))
        .send({
          status: 'rejected',
          reason: 'Allergen declaration needs correction.',
          expectedStatus: 'held',
          expectedSubmissionVersion: 1,
        })
        .expect(200);
      const publicItems = await request(app.getHttpServer())
        .get(`/v1/vendors/${moderationVendor.vendorId!}/menus/${menu.id}/items`)
        .expect(200);
      expect(JSON.stringify(publicItems.body)).toContain(held.id);
      expect(JSON.stringify(publicItems.body)).not.toContain(rejected.id);
      const vendorItems = await request(app.getHttpServer())
        .get(`/v1/vendors/${moderationVendor.vendorId!}/menus/${menu.id}/items`)
        .set(auth(moderationVendorToken))
        .expect(200);
      expect(vendorItems.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: rejected.id,
            moderationStatus: ModerationStatus.rejected,
            decisionReason: 'Allergen declaration needs correction.',
          }),
        ]),
      );

      const dispute = await factory.prisma.dispute.create({
        data: {
          orderId: customer.orderId!,
          raisedById: customer.userId,
          issueType: 'quality',
          severity: 'medium',
          description: 'Factory propagation outcome.',
          status: 'open',
          vendorRespondBy: days(2),
          platformRespondBy: days(2),
        },
      });
      await request(app.getHttpServer())
        .post(`/v1/disputes/${dispute.id}/close`)
        .set(auth(adminToken))
        .send({ resolution: 'rejected', resolutionNote: 'Outcome recorded for both parties.' })
        .expect(201);
      const disputeOrder = await factory.prisma.order.findUniqueOrThrow({
        where: { id: customer.orderId! },
        include: { vendor: { include: { user: true } } },
      });
      const disputeVendorToken = await factory.issueAccessToken({
        state: 'V5',
        credentials: {
          email: disputeOrder.vendor.user.email,
          password: process.env.TEST_FACTORY_PASSWORD!,
          role: 'vendor',
        },
        userId: disputeOrder.vendor.userId,
        vendorId: disputeOrder.vendorId,
        relatedUserIds: [],
        relatedVendorIds: [],
        storageObjects: [],
      });
      for (const token of [customerToken, disputeVendorToken]) {
        const visible = await request(app.getHttpServer())
          .get(`/v1/disputes/${dispute.id}`)
          .set(auth(token))
          .expect(200);
        expect(visible.body).toMatchObject({ status: 'closed', resolution: 'rejected' });
      }
    }, 60_000);
  },
);
