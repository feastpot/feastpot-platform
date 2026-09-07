/**
 * Authoritative admin action acceptance tests.
 *
 * These deliberately do not use browser routing or controller/service mocks:
 * every mutation is an authenticated HTTP request and every successful
 * mutation is checked again through Prisma.  This is the companion to the
 * admin UI specs, which cover controls and request shapes.
 */
import { createHash } from 'node:crypto';

import { getQueueToken } from '@nestjs/bull';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Job, Queue } from 'bull';
import request from 'supertest';

import { TestDataFactory, type TestIdentity } from '../../../../scripts/test-factory';
import { RoleThrottlerGuard } from '../common/guards/role-throttler.guard';
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
// Local discovery remains possible without destructive credentials. CI is
// deliberately fail-closed: a configured acceptance job must never turn green
// by silently skipping authoritative persistence checks.
const describeWhenProvisioned = provisioned || process.env.CI ? describe : describe.skip;

const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const futureDate = (days: number) => new Date(Date.now() + days * 86_400_000);
const narrative =
  'The independent compliance review recorded dated evidence, proportionality, and the vendor response.';

async function seedFailedQueueJob(queue: Queue, id: string): Promise<Job> {
  if (process.env.NODE_ENV !== 'test' || !id.startsWith('test-factory:admin-actions:')) {
    throw new Error('ADMIN_ACTIONS_QUEUE_SEED_FORBIDDEN');
  }
  const job = await queue.add('authority_seam', { provenance: 'test-factory' }, { jobId: id });
  // Claim exactly the namespaced job in Redis, then use Bull's real failure
  // transition script. This avoids waiting for an external worker while still
  // exercising the actual queue state used by the admin API.
  const redis = queue.client;
  const removed = await redis.lrem(queue.toKey('wait'), 0, String(job.id));
  if (removed !== 1) {
    throw new Error('ADMIN_ACTIONS_QUEUE_SEED_NOT_ISOLATED');
  }
  await redis.lpush(queue.toKey('active'), String(job.id));
  await job.moveToFailed({ message: 'Intentional authoritative-action seam failure' }, true);
  if ((await job.getState()) !== 'failed') throw new Error('ADMIN_ACTIONS_QUEUE_SEED_FAILED');
  return job;
}

describeWhenProvisioned('admin authoritative actions (factory JWTs and persisted state)', () => {
  let app: INestApplication;
  let factory: TestDataFactory;
  let admin: TestIdentity;
  let support: TestIdentity;
  let finance: TestIdentity;
  let compliance: TestIdentity;
  let aal2Admin: TestIdentity;
  let applicant: TestIdentity;
  let vendor: TestIdentity;
  let disputeVendor: TestIdentity;
  let adminToken: string;
  let complianceToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    if (!provisioned) {
      throw new Error(
        `ADMIN_ACTIONS_CREDENTIALS_REQUIRED: ${[
          ...required.filter((name) => !process.env[name]),
          ...(anonKey ? [] : ['SUPABASE_ANON_KEY']),
        ].join(', ')}`,
      );
    }
    factory = TestDataFactory.fromEnvironment({ namespace: `admin-actions-${Date.now()}` });
    // Keep fixture creation serial: Supabase MFA/session provisioning shares
    // an auth client.  A1/A3/A4/A5 are intentional coverage identities.
    admin = await factory.create('A1');
    // A2 intentionally upgrades the same canonical administrator after the
    // A1 token has been captured, giving the suite both assurance levels.
    adminToken = await factory.issueAccessToken(admin);
    aal2Admin = await factory.create('A2');
    support = await factory.create('A3');
    finance = await factory.create('A4');
    compliance = await factory.create('A5');
    applicant = await factory.create('V1');
    vendor = await factory.create('V4');
    disputeVendor = await factory.create('V5');
    complianceToken = await factory.issueAccessToken(compliance);

    const { AppModule } = await import('../app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // Throttling is not an authoritative action safeguard and can make this
      // serial real-HTTP suite flaky. Auth, roles, DTOs and services are real.
      .overrideProvider(RoleThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService(process.env))
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
      await Promise.all(
        [admin, aal2Admin, support, finance, compliance, applicant, vendor, disputeVendor]
          .filter(Boolean)
          .map((identity) => factory.teardown(identity)),
      );
    } finally {
      await app?.close();
      await factory?.dispose();
    }
  }, 120_000);

  it('approves an application and persists the provisioned vendor linkage', async () => {
    expect(applicant.vendorApplicationId).toBeDefined();
    const original = await factory.prisma.vendorApplication.findUniqueOrThrow({
      where: { id: applicant.vendorApplicationId! },
    });
    // V1 intentionally includes a customer account. Approval's collision
    // safeguard must remain real, so remove that account and re-seed only the
    // provenance-marked intake row using the factory-owned email.
    await factory.teardown(applicant);
    applicant.userId = '';
    const approvalSeed = await factory.prisma.vendorApplication.create({
      data: {
        fullName: original.fullName,
        kitchenName: original.kitchenName,
        email: original.email,
        phone: original.phone,
        postcode: original.postcode,
        cuisineType: original.cuisineType,
        kitchenType: original.kitchenType,
        hasFsaRegistration: original.hasFsaRegistration,
        foodStory: original.foodStory,
        marketingConsent: original.marketingConsent,
        acceptedTermsAt: original.acceptedTermsAt,
        acceptedTermsVersion: original.acceptedTermsVersion,
        isTestData: true,
      },
    });
    applicant.vendorApplicationId = approvalSeed.id;
    const result = await request(app.getHttpServer())
      .patch(`/v1/admin/vendor-applications/${approvalSeed.id}`)
      .set(auth(complianceToken))
      .send({ status: 'approved', sendInvite: true })
      .expect(200);

    expect(result.body.status).toBe('approved');
    const persisted = await factory.prisma.vendorApplication.findUniqueOrThrow({
      where: { id: applicant.vendorApplicationId! },
      select: { status: true, vendorId: true, reviewedById: true },
    });
    expect(persisted).toMatchObject({
      status: 'approved',
      reviewedById: compliance.userId,
    });
    expect(persisted.vendorId).toEqual(expect.any(String));
    await expect(
      factory.prisma.vendor.findUnique({ where: { id: persisted.vendorId! } }),
    ).resolves.toMatchObject({ id: persisted.vendorId });
  }, 30_000);

  it('persists an application rejection reason through the real admin API', async () => {
    const seed = await factory.prisma.vendorApplication.create({
      data: {
        fullName: 'Rejected Test Applicant',
        kitchenName: 'Rejected Test Kitchen',
        email: `rejected-${Date.now()}@test.feastpot.co.uk`,
        phone: '07123456789',
        postcode: 'SE15 4EE',
        cuisineType: 'Nigerian',
        kitchenType: 'Commercial',
        hasFsaRegistration: true,
        foodStory: 'A provenance-marked authoritative admin test application.',
        marketingConsent: false,
        acceptedTermsAt: new Date(),
        acceptedTermsVersion: 'test',
        isTestData: true,
      },
    });
    try {
      const result = await request(app.getHttpServer())
        .patch(`/v1/admin/vendor-applications/${seed.id}`)
        .set(auth(complianceToken))
        .send({
          status: 'rejected',
          rejectionReason: 'Current food-safety certificate was not supplied.',
        })
        .expect(200);
      expect(result.body.status).toBe('rejected');
      await expect(
        factory.prisma.vendorApplication.findUniqueOrThrow({ where: { id: seed.id } }),
      ).resolves.toMatchObject({
        status: 'rejected',
        rejectionReason: 'Current food-safety certificate was not supplied.',
        reviewedById: compliance.userId,
      });
    } finally {
      await factory.prisma.vendorApplication.deleteMany({ where: { id: seed.id } });
    }
  }, 30_000);

  it('rejects unsafe enforcement and atomically persists urgent notice, status, and audit', async () => {
    expect(vendor.vendorId).toBeDefined();
    const endpoint = `/v1/admin/vendors/${vendor.vendorId!}/enforcement`;

    await request(app.getHttpServer())
      .post(endpoint)
      .set(auth(complianceToken))
      .send({
        actionType: 'SUSPENSION',
        reasonCode: 'MATERIAL_BREACH',
        reasonNarrative: 'too short',
        effectiveAt: future(1),
      })
      .expect(400);
    await request(app.getHttpServer())
      .post(endpoint)
      .set(auth(complianceToken))
      .send({
        actionType: 'TERMINATION',
        reasonCode: 'MATERIAL_BREACH',
        reasonNarrative: narrative,
        effectiveAt: future(29),
      })
      .expect(400);

    const created = await request(app.getHttpServer())
      .post(endpoint)
      .set(auth(complianceToken))
      .send({
        actionType: 'SUSPENSION',
        reasonCode: 'FRAUD',
        reasonNarrative: narrative,
        effectiveAt: new Date().toISOString(),
        urgentBasis: 'Forensic payment review confirms an immediate fraud risk.',
      })
      .expect(201);

    const action = await factory.prisma.vendorEnforcementAction.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    const [persistedVendor, audit] = await Promise.all([
      factory.prisma.vendor.findUniqueOrThrow({
        where: { id: vendor.vendorId! },
        select: { status: true },
      }),
      factory.prisma.auditLog.findFirst({
        where: { entityId: vendor.vendorId!, action: 'vendor.enforcement_suspension' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    expect(action.noticeSentAt).not.toBeNull();
    expect(action.urgentBasis).toContain('Forensic');
    expect(persistedVendor.status).toBe('suspended');
    expect(audit).toMatchObject({ actorId: compliance.userId });
    const noticeJob = await app
      .get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE))
      .getJob(`enforcement_action:${action.id}`);
    expect(noticeJob?.data).toMatchObject({
      userId: expect.any(String),
      actionType: 'SUSPENSION',
      reasonNarrative: narrative,
      appealClause: '18.1',
      appealDeadline: expect.any(String),
    });
    expect(new Date(noticeJob!.data.appealDeadline).getTime()).toBeGreaterThan(
      action.effectiveAt.getTime(),
    );
  }, 30_000);

  it('enforces 30-day termination notice but accepts serious cause and preserves actor provenance', async () => {
    const response = await request(app.getHttpServer())
      .post(`/v1/admin/vendors/${vendor.vendorId!}/enforcement`)
      .set(auth(adminToken))
      .send({
        actionType: 'TERMINATION',
        reasonCode: 'FRAUD',
        reasonNarrative: narrative,
        effectiveAt: new Date().toISOString(),
        urgentBasis: 'Verified intentional fraud requires immediate termination.',
      })
      .expect(201);
    const action = await factory.prisma.vendorEnforcementAction.findUniqueOrThrow({
      where: { id: response.body.id },
      select: { actionType: true, reasonCode: true, urgentBasis: true, issuedBy: true },
    });
    expect(action).toMatchObject({
      actionType: 'TERMINATION',
      reasonCode: 'FRAUD',
      urgentBasis: 'Verified intentional fraud requires immediate termination.',
      issuedBy: admin.credentials.email,
    });
  }, 30_000);

  it('keeps restricted factory identities unable to perform authoritative mutations', async () => {
    const [supportToken, financeToken] = await Promise.all([
      factory.issueAccessToken(support),
      factory.issueAccessToken(finance),
    ]);
    for (const token of [supportToken, financeToken]) {
      const result = await request(app.getHttpServer())
        .post(`/v1/admin/vendors/${vendor.vendorId!}/enforcement`)
        .set(auth(token))
        .send({
          actionType: 'SUSPENSION',
          reasonCode: 'FRAUD',
          reasonNarrative: narrative,
          effectiveAt: new Date().toISOString(),
          urgentBasis: 'Forensic payment review confirms an immediate fraud risk.',
        });
      expect(result.status).toBe(403);
    }
  }, 30_000);

  it('rejects short-notice and unsigned vendor terms without writing a version', async () => {
    const before = await factory.prisma.termsVersion.count();
    const base = {
      documentType: 'VENDOR_TERMS',
      version: `authority-${Date.now()}`,
      contentMdx: '# Authoritative terms\nMaterial contractual amendment.',
      changeSummary: 'Material commission and cancellation amendment.',
      isMaterial: true,
      effectiveAt: future(10),
      createdBy: admin.credentials.email,
    };
    const unsigned = await request(app.getHttpServer())
      .post('/v1/terms/versions')
      .set(auth(adminToken))
      .send(base);
    expect(unsigned.status).toBe(400);
    const shortNotice = await request(app.getHttpServer())
      .post('/v1/terms/versions')
      .set(auth(adminToken))
      .send({ ...base, solicitorSignOff: 'Approved by Test Solicitor on 2026-01-01' });
    expect(shortNotice.status).toBe(400);
    expect(await factory.prisma.termsVersion.count()).toBe(before);
  });

  it('does not allow an increased commission rate to bypass 15-day notice', async () => {
    const suffix = Date.now();
    const current = await factory.prisma.commissionRate.findFirstOrThrow({
      where: { source: 'MARKETPLACE', effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    });
    const rejected = await request(app.getHttpServer())
      .post('/v1/admin/commission-rates')
      .set(auth(adminToken))
      .send({
        source: 'MARKETPLACE',
        isFirstOrder: current.isFirstOrder,
        ratePercent: Number(current.ratePercent) + 0.01,
        effectiveFrom: future(2),
        note: `authoritative increase ${suffix}`,
      });
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe('RATE_INCREASE_NOTICE_REQUIRED');
    expect(
      await factory.prisma.commissionRate.count({
        where: { note: `authoritative increase ${suffix}` },
      }),
    ).toBe(0);
  });

  it('persists catering SLA triage outcome and operator note', async () => {
    const enquiry = await factory.prisma.cateringEnquiry.create({
      data: {
        occasionType: 'Wedding',
        guestCountBand: '50-100',
        cuisineStyle: 'Nigerian',
        postcode: 'SE15 4EE',
        outwardCode: 'SE15',
        contactName: 'Authoritative SLA Test',
        email: `catering-${Date.now()}@test.feastpot.co.uk`,
        status: 'NEW',
        createdAt: new Date(Date.now() - 60 * 3_600_000),
        isTestData: true,
        provenance: 'test-factory',
      },
    });
    try {
      await request(app.getHttpServer())
        .patch(`/v1/catering-enquiries/${enquiry.id}`)
        .set(auth(adminToken))
        .send({
          status: 'QUALIFIED',
          adminNotes: 'Overdue SLA triaged by operations; customer contacted.',
        })
        .expect(200);
      await expect(
        factory.prisma.cateringEnquiry.findUniqueOrThrow({ where: { id: enquiry.id } }),
      ).resolves.toMatchObject({
        status: 'QUALIFIED',
        adminNotes: 'Overdue SLA triaged by operations; customer contacted.',
        isTestData: true,
        provenance: 'test-factory',
      });
    } finally {
      await factory.prisma.cateringEnquiry.deleteMany({ where: { id: enquiry.id } });
    }
  });

  it('exports complete, independently verifiable terms and enforcement evidence', async () => {
    const response = await request(app.getHttpServer())
      .get(`/v1/terms/admin/evidence/${vendor.vendorId!}`)
      .set(auth(complianceToken))
      .expect(200);
    expect(response.body.vendor.id).toBe(vendor.vendorId);
    expect(response.body.enforcementActions.map((row: { id: string }) => row.id)).toEqual(
      expect.arrayContaining(
        (
          await factory.prisma.vendorEnforcementAction.findMany({
            where: { vendorId: vendor.vendorId! },
            select: { id: true },
          })
        ).map((row) => row.id),
      ),
    );
    const acceptance = await factory.prisma.termsAcceptance.findFirst({
      where: { vendorId: vendor.vendorId! },
      include: { termsVersion: true },
    });
    if (acceptance) {
      expect(createHash('sha256').update(acceptance.termsVersion.contentMdx).digest('hex')).toBe(
        acceptance.contentHash,
      );
      expect(response.body.acceptances).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: acceptance.id })]),
      );
    }
  });

  it('persists vendor response/decision, enforces appeal timing and independent stage 2, and reverses payout', async () => {
    expect(disputeVendor.orderId).toBeDefined();
    expect(disputeVendor.vendorId).toBeDefined();
    const order = await factory.prisma.order.findUniqueOrThrow({
      where: { id: disputeVendor.orderId! },
      select: { customerId: true },
    });
    const seeded = await factory.prisma.dispute.create({
      data: {
        orderId: disputeVendor.orderId!,
        raisedById: order.customerId,
        issueType: 'missing_items',
        severity: 'high',
        description: 'Authoritative dispute fixture with persisted packing evidence.',
        status: 'open',
        vendorRespondBy: futureDate(2),
        platformRespondBy: futureDate(2),
      },
    });
    const vendorToken = await factory.issueAccessToken(disputeVendor);
    const supportToken = await factory.issueAccessToken(support);
    try {
      // The absence of a response is a persisted state, not a UI inference.
      await expect(
        factory.prisma.dispute.findUniqueOrThrow({ where: { id: seeded.id } }),
      ).resolves.toMatchObject({ vendorResponse: null, vendorRespondedAt: null });

      await request(app.getHttpServer())
        .post(`/v1/disputes/${seeded.id}/vendor-response`)
        .set(auth(vendorToken))
        .send({ response: 'Contemporaneous packing photographs show all items were dispatched.' })
        .expect(201);
      await expect(
        factory.prisma.dispute.findUniqueOrThrow({ where: { id: seeded.id } }),
      ).resolves.toMatchObject({
        status: 'vendor_contacted',
        vendorResponse: 'Contemporaneous packing photographs show all items were dispatched.',
      });

      await request(app.getHttpServer())
        .post(`/v1/disputes/${seeded.id}/close`)
        .set(auth(supportToken))
        .send({
          resolution: 'rejected',
          resolutionNote: 'Vendor evidence was accepted after independent review.',
        })
        .expect(201);
      await expect(
        factory.prisma.dispute.findUniqueOrThrow({ where: { id: seeded.id } }),
      ).resolves.toMatchObject({
        status: 'closed',
        resolution: 'rejected',
        decidedById: support.userId,
      });

      await request(app.getHttpServer())
        .post(`/v1/disputes/${seeded.id}/appeal`)
        .set(auth(vendorToken))
        .send({ grounds: 'The payout deduction should be reversed based on the complete record.' })
        .expect(201);

      const reasons =
        'The complete contemporaneous evidence record was reviewed and a written conclusion recorded.';
      await request(app.getHttpServer())
        .post(`/v1/disputes/${seeded.id}/appeal/stage1`)
        .set(auth(supportToken))
        .send({ outcome: 'OVERTURNED', reasons })
        .expect(201);
      const sameReviewer = await request(app.getHttpServer())
        .post(`/v1/disputes/${seeded.id}/appeal/stage2`)
        .set(auth(supportToken))
        .send({ outcome: 'UPHELD', reasons });
      expect(sameReviewer.status).toBe(403);
      expect(sameReviewer.body.code).toBe('SAME_REVIEWER');

      const draft = await factory.prisma.payout.create({
        data: {
          vendorId: disputeVendor.vendorId!,
          amountPence: 500,
          grossPence: 1_000,
          commissionPence: 0,
          refundsPence: 500,
          status: 'draft',
          periodStart: new Date(),
          periodEnd: futureDate(7),
          orderCount: 0,
          holdReason: `authority-appeal:${seeded.id}`,
        },
      });
      await factory.prisma.dispute.update({
        where: { id: seeded.id },
        data: { refundPence: 500 },
      });
      await request(app.getHttpServer())
        .post(`/v1/disputes/${seeded.id}/appeal/stage2`)
        .set(auth(adminToken))
        .send({ outcome: 'UPHELD', reasons })
        .expect(201);
      await expect(
        factory.prisma.payout.findUniqueOrThrow({ where: { id: draft.id } }),
      ).resolves.toMatchObject({ amountPence: 1_000, refundsPence: 0 });

      // Re-use the isolated order only after deleting the completed appeal:
      // the closed-window rejection must not create replacement state.
      await factory.prisma.disputeAppeal.delete({ where: { disputeId: seeded.id } });
      await factory.prisma.dispute.update({
        where: { id: seeded.id },
        data: { decidedAt: new Date(Date.now() - 15 * 86_400_000) },
      });
      const late = await request(app.getHttpServer())
        .post(`/v1/disputes/${seeded.id}/appeal`)
        .set(auth(vendorToken))
        .send({ grounds: 'This submission is intentionally outside the fourteen day window.' });
      expect(late.status).toBe(400);
      expect(late.body.code).toBe('APPEAL_WINDOW_CLOSED');
      expect(await factory.prisma.disputeAppeal.count({ where: { disputeId: seeded.id } })).toBe(0);
      await factory.prisma.payout.deleteMany({ where: { id: draft.id } });
    } finally {
      await factory.prisma.disputeAppeal.deleteMany({ where: { disputeId: seeded.id } });
      await factory.prisma.dispute.deleteMany({ where: { id: seeded.id } });
    }
  }, 60_000);

  it('requires a role-change reason, persists the AAL2 actor, and audits old/new roles', async () => {
    const aal2Token = aal2Admin.accessToken!;
    await request(app.getHttpServer())
      .patch(`/v1/admin/users/${support.userId}/role`)
      .set(auth(aal2Token))
      .send({ role: 'finance', reason: 'short' })
      .expect(400);
    await request(app.getHttpServer())
      .patch(`/v1/admin/users/${support.userId}/role`)
      .set(auth(aal2Token))
      .send({
        role: 'finance',
        reason: 'Access responsibilities moved from support to finance operations.',
      })
      .expect(200);
    const [changed, audit] = await Promise.all([
      factory.prisma.user.findUniqueOrThrow({ where: { id: support.userId } }),
      factory.prisma.auditLog.findFirstOrThrow({
        where: {
          actorId: aal2Admin.userId,
          entityId: support.userId,
          action: 'admin.user_role_changed',
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    expect(changed.role).toBe('finance');
    expect(audit.metadata).toMatchObject({
      reason: 'Access responsibilities moved from support to finance operations.',
      previousState: { role: 'support' },
      newState: { role: 'finance' },
    });
  }, 30_000);

  it('rejects self-demotion of the last active administrator', async () => {
    const result = await request(app.getHttpServer())
      .patch(`/v1/admin/users/${aal2Admin.userId}/role`)
      .set(auth(aal2Admin.accessToken!))
      .send({
        role: 'customer',
        reason: 'Attempting authoritative last-administrator demotion.',
      });
    expect(result.status).toBe(403);
    await expect(
      factory.prisma.user.findUniqueOrThrow({ where: { id: aal2Admin.userId } }),
    ).resolves.toMatchObject({ role: 'admin', status: 'active' });
  });

  it('moves a real failed queue job on retry and records discard actor audit', async () => {
    const queue = app.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));
    const stem = `test-factory:admin-actions:${Date.now()}`;
    let retryJob: Job | undefined;
    let discardJob: Job | undefined;
    try {
      retryJob = await seedFailedQueueJob(queue, `${stem}:retry`);
      await queue.pause(true);
      await request(app.getHttpServer())
        .post(
          `/v1/admin/dead-letters/${NOTIFICATIONS_QUEUE}/${encodeURIComponent(String(retryJob.id))}/retry`,
        )
        .set(auth(aal2Admin.accessToken!))
        .expect(200);
      expect(await retryJob.getState()).toBe('waiting');
      await retryJob.remove();

      await queue.resume(true);
      discardJob = await seedFailedQueueJob(queue, `${stem}:discard`);
      await queue.pause(true);
      await request(app.getHttpServer())
        .post(
          `/v1/admin/dead-letters/${NOTIFICATIONS_QUEUE}/${encodeURIComponent(String(discardJob.id))}/discard`,
        )
        .set(auth(aal2Admin.accessToken!))
        .expect(200);
      expect(await queue.getJob(discardJob.id)).toBeNull();
      await expect(
        factory.prisma.auditLog.findFirstOrThrow({
          where: {
            actorId: aal2Admin.userId,
            action: 'admin.queue_job_discarded',
          },
          orderBy: { createdAt: 'desc' },
        }),
      ).resolves.toMatchObject({
        metadata: expect.objectContaining({
          queue: NOTIFICATIONS_QUEUE,
          jobId: String(discardJob.id),
          status: 'completed',
        }),
      });
    } finally {
      await retryJob?.remove().catch(() => undefined);
      await discardJob?.remove().catch(() => undefined);
      await queue.resume(true);
    }
  }, 30_000);
});
