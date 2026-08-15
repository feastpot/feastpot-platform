/**
 * VendorVerificationService -- notification behaviour
 *
 * Covers:
 *   - Each actionable transition (VERIFIED->RENEWAL_DUE, VERIFIED->SUSPENDED)
 *     sends exactly one email.
 *   - A non-actionable transition (RENEWAL_DUE->VERIFIED) sends no email.
 *   - A no-op upsert (state unchanged) sends no email.
 *   - A rapid repeated upsert to the same new state within the dedup window
 *     sends no second email.
 *   - The lastNotifiedState / lastNotifiedAt / lastNotifiedChannel tracking
 *     columns are written after every send.
 *   - SUSPENDED payload includes pendingOrderCount and PLATFORM_FACTS values.
 *   - Missing userId is logged at ERROR level; no throw, no send.
 *
 * Does NOT test email delivery or template rendering -- those belong in the
 * notification processor tests.
 */

import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';
import { VerificationState, FhrsStatus } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';
import { VendorEnforcementService } from '../vendor-enforcement/vendor-enforcement.service';

import { VendorVerificationService } from './vendor-verification.service';

// ── Minimal DTO helpers ──────────────────────────────────────────────────────

function baseDto(overallState: VerificationState) {
  return {
    registrationNumber: 'REG001',
    registrationAuthority: 'Test Council',
    registrationConfirmedAt: '2025-01-01T00:00:00.000Z',
    fhrsRating: 5,
    fhrsRatingCheckedAt: '2025-01-01T00:00:00.000Z',
    fhrsInspectionStatus: FhrsStatus.RATED,
    insuranceProvider: 'Acme Insurance',
    insuranceValidUntil: '2027-01-01T00:00:00.000Z',
    allergenTrainingHeld: true,
    allergenTrainingUntil: '2027-01-01T00:00:00.000Z',
    idVerifiedAt: '2025-01-01T00:00:00.000Z',
    overallState,
  };
}

// ── Mock factories ───────────────────────────────────────────────────────────

const VENDOR_ID = 'vendor-abc';
const USER_ID = 'user-xyz';
const BUSINESS_NAME = 'Test Kitchen';

/**
 * Build a minimal PrismaService mock covering the queries
 * VendorVerificationService actually makes.
 */
function makePrismaMock({
  existingState,
  existingLastNotifiedState = null,
  existingLastNotifiedAt = null,
  pendingOrderCount = 0,
}: {
  existingState: VerificationState | null;
  existingLastNotifiedState?: VerificationState | null;
  existingLastNotifiedAt?: Date | null;
  pendingOrderCount?: number;
}) {
  const vendorVerification = {
    findUnique: jest.fn().mockResolvedValue(
      existingState !== null
        ? {
            overallState: existingState,
            lastNotifiedState: existingLastNotifiedState,
            lastNotifiedAt: existingLastNotifiedAt,
          }
        : null,
    ),
    upsert: jest.fn().mockResolvedValue({ id: 'vv-1', overallState: VerificationState.VERIFIED }),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  };

  const vendor = {
    findUnique: jest.fn().mockResolvedValue({
      userId: USER_ID,
      businessName: BUSINESS_NAME,
    }),
    findMany: jest.fn().mockResolvedValue([]),
  };

  const order = {
    count: jest.fn().mockResolvedValue(pendingOrderCount),
  };

  return { vendorVerification, vendor, order } as unknown as jest.Mocked<any>;
}

function makeNotificationsMock() {
  return {
    enqueue: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<NotificationsService>;
}

function makeEnforcementMock() {
  return {
    createAutomatedSuspension: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<VendorEnforcementService>;
}

function makeService(prisma: any, notifications: any) {
  return new VendorVerificationService(prisma, notifications, makeEnforcementMock());
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('VendorVerificationService -- notification on state transition', () => {
  describe('upsertVerification: VERIFIED -> RENEWAL_DUE', () => {
    it('sends exactly one verification_renewal_due email', async () => {
      const prisma = makePrismaMock({ existingState: VerificationState.VERIFIED });
      const notifications = makeNotificationsMock();
      const svc = makeService(prisma, notifications);

      await svc.upsertVerification(VENDOR_ID, baseDto(VerificationState.RENEWAL_DUE));

      expect(notifications.enqueue).toHaveBeenCalledTimes(1);
      expect(notifications.enqueue).toHaveBeenCalledWith(
        'verification_renewal_due',
        expect.objectContaining({ userId: USER_ID, vendorName: BUSINESS_NAME }),
        expect.objectContaining({ jobId: expect.stringContaining(`${VENDOR_ID}:RENEWAL_DUE`) }),
      );
    });

    it('includes complianceEmail from PLATFORM_FACTS in the payload', async () => {
      const prisma = makePrismaMock({ existingState: VerificationState.VERIFIED });
      const notifications = makeNotificationsMock();
      await makeService(prisma, notifications).upsertVerification(
        VENDOR_ID,
        baseDto(VerificationState.RENEWAL_DUE),
      );
      const [, payload] = notifications.enqueue.mock.calls[0] as [
        string,
        Record<string, unknown>,
        unknown,
      ];
      expect(payload.complianceEmail).toBe(PLATFORM_FACTS.contact.complianceEmail);
    });

    it('writes lastNotifiedState=RENEWAL_DUE, lastNotifiedChannel=email', async () => {
      const prisma = makePrismaMock({ existingState: VerificationState.VERIFIED });
      await makeService(prisma, makeNotificationsMock()).upsertVerification(
        VENDOR_ID,
        baseDto(VerificationState.RENEWAL_DUE),
      );
      expect(prisma.vendorVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastNotifiedState: VerificationState.RENEWAL_DUE,
            lastNotifiedChannel: 'email',
            lastNotifiedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('upsertVerification: VERIFIED -> SUSPENDED', () => {
    it('sends exactly one verification_suspended email', async () => {
      const prisma = makePrismaMock({ existingState: VerificationState.VERIFIED });
      const notifications = makeNotificationsMock();
      await makeService(prisma, notifications).upsertVerification(
        VENDOR_ID,
        baseDto(VerificationState.SUSPENDED),
      );

      expect(notifications.enqueue).toHaveBeenCalledTimes(1);
      expect(notifications.enqueue).toHaveBeenCalledWith(
        'verification_suspended',
        expect.objectContaining({ userId: USER_ID }),
        expect.objectContaining({ jobId: expect.stringContaining(`${VENDOR_ID}:SUSPENDED`) }),
      );
    });

    it('includes appealWindowDays and appealsEmail from PLATFORM_FACTS in payload', async () => {
      const prisma = makePrismaMock({ existingState: VerificationState.VERIFIED });
      const notifications = makeNotificationsMock();
      await makeService(prisma, notifications).upsertVerification(
        VENDOR_ID,
        baseDto(VerificationState.SUSPENDED),
      );
      const [, payload] = notifications.enqueue.mock.calls[0] as [
        string,
        Record<string, unknown>,
        unknown,
      ];
      expect(payload.appealWindowDays).toBe(PLATFORM_FACTS.appealWindowDays);
      expect(payload.appealsEmail).toBe(PLATFORM_FACTS.contact.appealsEmail);
    });

    it('includes pendingOrderCount in payload when vendor has active orders', async () => {
      const prisma = makePrismaMock({
        existingState: VerificationState.VERIFIED,
        pendingOrderCount: 3,
      });
      const notifications = makeNotificationsMock();
      await makeService(prisma, notifications).upsertVerification(
        VENDOR_ID,
        baseDto(VerificationState.SUSPENDED),
      );
      const [, payload] = notifications.enqueue.mock.calls[0] as [
        string,
        Record<string, unknown>,
        unknown,
      ];
      expect(payload.pendingOrderCount).toBe(3);
    });

    it('writes lastNotifiedState=SUSPENDED, lastNotifiedChannel=email', async () => {
      const prisma = makePrismaMock({ existingState: VerificationState.VERIFIED });
      await makeService(prisma, makeNotificationsMock()).upsertVerification(
        VENDOR_ID,
        baseDto(VerificationState.SUSPENDED),
      );
      expect(prisma.vendorVerification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastNotifiedState: VerificationState.SUSPENDED,
            lastNotifiedChannel: 'email',
          }),
        }),
      );
    });
  });

  describe('upsertVerification: no-op (state unchanged)', () => {
    it('sends no notification when RENEWAL_DUE -> RENEWAL_DUE', async () => {
      const prisma = makePrismaMock({ existingState: VerificationState.RENEWAL_DUE });
      const notifications = makeNotificationsMock();
      await makeService(prisma, notifications).upsertVerification(
        VENDOR_ID,
        baseDto(VerificationState.RENEWAL_DUE),
      );
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });

    it('sends no notification when SUSPENDED -> SUSPENDED', async () => {
      const prisma = makePrismaMock({ existingState: VerificationState.SUSPENDED });
      const notifications = makeNotificationsMock();
      await makeService(prisma, notifications).upsertVerification(
        VENDOR_ID,
        baseDto(VerificationState.SUSPENDED),
      );
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('upsertVerification: transition to non-actionable state', () => {
    it('sends no notification when SUSPENDED -> VERIFIED', async () => {
      const prisma = makePrismaMock({ existingState: VerificationState.SUSPENDED });
      const notifications = makeNotificationsMock();
      await makeService(prisma, notifications).upsertVerification(
        VENDOR_ID,
        baseDto(VerificationState.VERIFIED),
      );
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });

    it('sends no notification when RENEWAL_DUE -> VERIFIED', async () => {
      const prisma = makePrismaMock({ existingState: VerificationState.RENEWAL_DUE });
      const notifications = makeNotificationsMock();
      await makeService(prisma, notifications).upsertVerification(
        VENDOR_ID,
        baseDto(VerificationState.VERIFIED),
      );
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('upsertVerification: deduplication within 1-hour window', () => {
    it('does not send a second email when the same state was notified 30 minutes ago', async () => {
      const recentAt = new Date(Date.now() - 30 * 60 * 1000); // 30 min ago
      const prisma = makePrismaMock({
        existingState: VerificationState.VERIFIED,
        existingLastNotifiedState: VerificationState.SUSPENDED,
        existingLastNotifiedAt: recentAt,
      });
      // Simulate: state was VERIFIED in DB but notification tracking says SUSPENDED
      // sent recently. This happens when: enforcement sets state to SUSPENDED (without
      // calling our path), admin lifts, admin re-suspends manually within the hour.
      prisma.vendorVerification.findUnique.mockResolvedValue({
        overallState: VerificationState.RENEWAL_DUE,
        lastNotifiedState: VerificationState.SUSPENDED,
        lastNotifiedAt: recentAt,
      });

      const notifications = makeNotificationsMock();
      await makeService(prisma, notifications).upsertVerification(
        VENDOR_ID,
        baseDto(VerificationState.SUSPENDED),
      );
      // previousState=RENEWAL_DUE, newState=SUSPENDED (a real transition),
      // but lastNotifiedState=SUSPENDED within window -> dedup fires
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });

    it('sends the email when the same state was notified more than 1 hour ago', async () => {
      const oldAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
      const prisma = makePrismaMock({
        existingState: VerificationState.RENEWAL_DUE,
        existingLastNotifiedState: VerificationState.SUSPENDED,
        existingLastNotifiedAt: oldAt,
      });
      prisma.vendorVerification.findUnique.mockResolvedValue({
        overallState: VerificationState.RENEWAL_DUE,
        lastNotifiedState: VerificationState.SUSPENDED,
        lastNotifiedAt: oldAt,
      });

      const notifications = makeNotificationsMock();
      await makeService(prisma, notifications).upsertVerification(
        VENDOR_ID,
        baseDto(VerificationState.SUSPENDED),
      );
      expect(notifications.enqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('upsertVerification: missing userId', () => {
    it('logs an error and does not throw when vendor has no userId', async () => {
      const prisma = makePrismaMock({ existingState: VerificationState.VERIFIED });
      prisma.vendor.findUnique.mockResolvedValue({ userId: null, businessName: BUSINESS_NAME });
      const notifications = makeNotificationsMock();
      const svc = makeService(prisma, notifications);
      const logSpy = jest.spyOn(svc['logger'], 'error').mockImplementation(() => {});

      await expect(
        svc.upsertVerification(VENDOR_ID, baseDto(VerificationState.SUSPENDED)),
      ).resolves.toBeDefined();

      expect(notifications.enqueue).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('no userId'));
    });
  });

  describe('upsertVerification: new vendor record (no prior state)', () => {
    it('sends notification when creating a record directly as SUSPENDED', async () => {
      // existingState=null means no prior record
      const prisma = makePrismaMock({ existingState: null });
      const notifications = makeNotificationsMock();
      await makeService(prisma, notifications).upsertVerification(
        VENDOR_ID,
        baseDto(VerificationState.SUSPENDED),
      );
      // previousState=null, newState=SUSPENDED: a genuine transition
      expect(notifications.enqueue).toHaveBeenCalledTimes(1);
      expect(notifications.enqueue).toHaveBeenCalledWith(
        'verification_suspended',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('sends no notification when creating a record as VERIFIED', async () => {
      const prisma = makePrismaMock({ existingState: null });
      const notifications = makeNotificationsMock();
      await makeService(prisma, notifications).upsertVerification(
        VENDOR_ID,
        baseDto(VerificationState.VERIFIED),
      );
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });
  });
});
