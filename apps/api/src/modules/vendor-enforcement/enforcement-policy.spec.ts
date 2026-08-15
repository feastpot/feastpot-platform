/**
 * Enforcement policy unit tests.
 *
 * Acceptance criteria from the P2B statement of reasons task:
 *   1. No enforcement action can be created without a narrative (>= 50 chars).
 *   2. A non-urgent action with noticeSentAt after effectiveAt is rejected.
 *   3. TERMINATION under 30 days notice requires an explicit serious-cause code.
 *   4. The automated FHRS job produces a compliant notice (narrative >= 50 chars).
 */

import { BadRequestException } from '@nestjs/common';
import { EnforcementType, VendorStatus } from '@prisma/client';

import { NotificationsService } from '../notifications/notifications.service';

import { SERIOUS_CAUSE_CODES, URGENT_REASON_CODES } from './dto/create-enforcement-action.dto';
import { VendorEnforcementService } from './vendor-enforcement.service';

// ── Helpers ──────────────────────────────────────────────────────────────────

const GOOD_NARRATIVE =
  'This listing has been suspended because the vendor has not renewed their public liability insurance within the 7-day grace period following expiry. Immediate action is required.';

const SHORT_NARRATIVE = 'Too short.';

function isoFuture(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString();
}

function makePrisma(vendorStatus: VendorStatus = VendorStatus.live) {
  return {
    vendor: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'vendor-1',
        userId: 'user-1',
        businessName: 'Test Kitchen',
        status: vendorStatus,
        verification: null,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    vendorEnforcementAction: {
      create: jest
        .fn()
        .mockImplementation((args: { data: object }) =>
          Promise.resolve({ id: 'action-1', ...args.data }),
        ),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'action-1', liftedAt: new Date() }),
    },
    vendorVerification: {
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation((fn: (tx: object) => Promise<unknown>) =>
      fn({
        vendor: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'vendor-1',
            userId: 'user-1',
            businessName: 'Test Kitchen',
            status: vendorStatus,
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        vendorEnforcementAction: {
          create: jest
            .fn()
            .mockImplementation((args: { data: object }) =>
              Promise.resolve({ id: 'action-1', ...args.data }),
            ),
          update: jest.fn().mockResolvedValue({ id: 'action-1', liftedAt: new Date() }),
        },
        vendorVerification: {
          findUnique: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({}),
        },
      }),
    ),
  };
}

function makeNotifications() {
  return { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
}

function makeSvc(vendorStatus?: VendorStatus) {
  return new VendorEnforcementService(makePrisma(vendorStatus) as any, makeNotifications());
}

// ── 1. Narrative length validation ───────────────────────────────────────────

describe('Narrative length', () => {
  it('rejects a narrative shorter than 50 characters', async () => {
    const svc = makeSvc();
    await expect(
      svc.createAction(
        'vendor-1',
        {
          actionType: EnforcementType.SUSPENSION,
          reasonCode: 'DOCUMENT_EXPIRED',
          reasonNarrative: SHORT_NARRATIVE,
          effectiveAt: isoFuture(0),
        },
        'staff@feastpot.co.uk',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a narrative of exactly 50 characters', async () => {
    const svc = makeSvc();
    const exactlyFifty = 'A'.repeat(50);
    await expect(
      svc.createAction(
        'vendor-1',
        {
          actionType: EnforcementType.SUSPENSION,
          reasonCode: 'DOCUMENT_EXPIRED',
          reasonNarrative: exactlyFifty,
          effectiveAt: isoFuture(0),
        },
        'staff@feastpot.co.uk',
      ),
    ).resolves.toMatchObject({ id: 'action-1' });
  });

  it('rejects a narrative with only whitespace padding to 50+ chars', async () => {
    const svc = makeSvc();
    const paddedWithSpace = 'x ' + ' '.repeat(60);
    await expect(
      svc.createAction(
        'vendor-1',
        {
          actionType: EnforcementType.SUSPENSION,
          reasonCode: 'DOCUMENT_EXPIRED',
          reasonNarrative: paddedWithSpace,
          effectiveAt: isoFuture(0),
        },
        'staff@feastpot.co.uk',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── 2. Notice timing for non-urgent actions ───────────────────────────────────

describe('Non-urgent notice timing', () => {
  it('rejects when effectiveAt is in the past (notice would be after effective)', async () => {
    const svc = makeSvc();
    await expect(
      svc.createAction(
        'vendor-1',
        {
          actionType: EnforcementType.SUSPENSION,
          reasonCode: 'MATERIAL_BREACH',
          reasonNarrative: GOOD_NARRATIVE,
          effectiveAt: isoFuture(-1), // yesterday
        },
        'staff@feastpot.co.uk',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects with code NOTICE_BEFORE_EFFECTIVE', async () => {
    const svc = makeSvc();
    try {
      await svc.createAction(
        'vendor-1',
        {
          actionType: EnforcementType.SUSPENSION,
          reasonCode: 'REPEATED_COMPLAINTS',
          reasonNarrative: GOOD_NARRATIVE,
          effectiveAt: isoFuture(-2),
        },
        'staff@feastpot.co.uk',
      );
      fail('expected BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        code: 'NOTICE_BEFORE_EFFECTIVE',
      });
    }
  });

  it('accepts when effectiveAt is now or in the future', async () => {
    const svc = makeSvc();
    await expect(
      svc.createAction(
        'vendor-1',
        {
          actionType: EnforcementType.SUSPENSION,
          reasonCode: 'MATERIAL_BREACH',
          reasonNarrative: GOOD_NARRATIVE,
          effectiveAt: isoFuture(7),
        },
        'staff@feastpot.co.uk',
      ),
    ).resolves.toMatchObject({ id: 'action-1' });
  });
});

// ── 3. Urgent actions bypass timing restriction ───────────────────────────────

describe('Urgent actions', () => {
  it.each(URGENT_REASON_CODES)('%s requires urgentBasis', async (reasonCode) => {
    const svc = makeSvc();
    await expect(
      svc.createAction(
        'vendor-1',
        {
          actionType: EnforcementType.SUSPENSION,
          reasonCode,
          reasonNarrative: GOOD_NARRATIVE,
          effectiveAt: isoFuture(0), // now
          // urgentBasis missing
        },
        'system',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts urgent action with effectiveAt = now and urgentBasis provided', async () => {
    const svc = makeSvc();
    await expect(
      svc.createAction(
        'vendor-1',
        {
          actionType: EnforcementType.SUSPENSION,
          reasonCode: 'FHRS_BELOW_THRESHOLD',
          reasonNarrative: GOOD_NARRATIVE,
          effectiveAt: isoFuture(0),
          urgentBasis:
            'FHRS rating of 1/5 received. Immediate suspension required under food safety obligations.',
        },
        'system',
      ),
    ).resolves.toMatchObject({ id: 'action-1' });
  });
});

// ── 4. Termination 30-day notice ─────────────────────────────────────────────

describe('Termination notice period', () => {
  it('rejects TERMINATION with effectiveAt < 30 days out for non-serious-cause', async () => {
    const svc = makeSvc();
    await expect(
      svc.createAction(
        'vendor-1',
        {
          actionType: EnforcementType.TERMINATION,
          reasonCode: 'MATERIAL_BREACH',
          reasonNarrative: GOOD_NARRATIVE,
          effectiveAt: isoFuture(15), // only 15 days
        },
        'staff@feastpot.co.uk',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects with code TERMINATION_NOTICE_TOO_SHORT', async () => {
    const svc = makeSvc();
    try {
      await svc.createAction(
        'vendor-1',
        {
          actionType: EnforcementType.TERMINATION,
          reasonCode: 'PROHIBITED_CONDUCT',
          reasonNarrative: GOOD_NARRATIVE,
          effectiveAt: isoFuture(10),
        },
        'staff@feastpot.co.uk',
      );
      fail('expected BadRequestException');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      expect((err as BadRequestException).getResponse()).toMatchObject({
        code: 'TERMINATION_NOTICE_TOO_SHORT',
      });
    }
  });

  it('accepts TERMINATION with effectiveAt >= 30 days out', async () => {
    const svc = makeSvc();
    await expect(
      svc.createAction(
        'vendor-1',
        {
          actionType: EnforcementType.TERMINATION,
          reasonCode: 'MATERIAL_BREACH',
          reasonNarrative: GOOD_NARRATIVE,
          effectiveAt: isoFuture(31),
        },
        'staff@feastpot.co.uk',
      ),
    ).resolves.toMatchObject({ id: 'action-1' });
  });

  it.each(SERIOUS_CAUSE_CODES)(
    'accepts immediate TERMINATION for serious-cause code %s',
    async (reasonCode) => {
      const svc = makeSvc();
      await expect(
        svc.createAction(
          'vendor-1',
          {
            actionType: EnforcementType.TERMINATION,
            reasonCode,
            reasonNarrative: GOOD_NARRATIVE,
            effectiveAt: isoFuture(0),
            urgentBasis: 'Serious cause: fraud detected. Immediate termination required.',
          },
          'staff@feastpot.co.uk',
        ),
      ).resolves.toMatchObject({ id: 'action-1' });
    },
  );
});

// ── 5. Automated FHRS suspension produces compliant notice ───────────────────

describe('Automated FHRS suspension', () => {
  it('produces a narrative of at least 50 characters', async () => {
    const svc = makeSvc();
    const capturedNarratives: string[] = [];
    const _originalCreate = (svc as any).prisma.vendorEnforcementAction.create;
    (svc as any).prisma.vendorEnforcementAction.create = jest
      .fn()
      .mockImplementation((args: { data: { reasonNarrative: string } }) => {
        capturedNarratives.push(args.data.reasonNarrative);
        return Promise.resolve({ id: 'action-1', ...args.data });
      });
    // The $transaction mock calls create on the nested tx object, not the top-level one.
    // Verify via the service method directly.
    const createSpy = jest.spyOn(svc, 'createAction');
    await svc.createAutomatedSuspension('vendor-1', 'FHRS_BELOW_THRESHOLD', 'FHRS rating of 2/5');
    expect(createSpy).toHaveBeenCalledWith(
      'vendor-1',
      expect.objectContaining({
        reasonNarrative: expect.stringMatching(/.{50,}/s),
      }),
      'system',
    );
  });

  it('uses an urgent reason code for FHRS_BELOW_THRESHOLD', async () => {
    const svc = makeSvc();
    const createSpy = jest.spyOn(svc, 'createAction');
    await svc.createAutomatedSuspension('vendor-1', 'FHRS_BELOW_THRESHOLD', 'FHRS rating of 2/5');
    expect(createSpy).toHaveBeenCalledWith(
      'vendor-1',
      expect.objectContaining({
        reasonCode: 'FHRS_BELOW_THRESHOLD',
        urgentBasis: expect.stringMatching(/.{20,}/),
      }),
      'system',
    );
  });

  it('uses a non-urgent reason code for DOCUMENT_EXPIRED', async () => {
    const svc = makeSvc();
    const createSpy = jest.spyOn(svc, 'createAction');
    await svc.createAutomatedSuspension(
      'vendor-1',
      'DOCUMENT_EXPIRED',
      'Public liability insurance expired',
    );
    expect(createSpy).toHaveBeenCalledWith(
      'vendor-1',
      expect.objectContaining({
        reasonCode: 'DOCUMENT_EXPIRED',
        urgentBasis: undefined,
      }),
      'system',
    );
  });
});

// ── 6. Lift action ────────────────────────────────────────────────────────────

describe('Lift action', () => {
  it('rejects lifting an already-lifted action', async () => {
    const prisma = makePrisma();
    (prisma.vendorEnforcementAction.findUnique as jest.Mock).mockResolvedValue({
      id: 'action-1',
      actionType: EnforcementType.SUSPENSION,
      vendorId: 'vendor-1',
      liftedAt: new Date(), // already lifted
      facts: { priorStatus: 'live' },
      vendor: { id: 'vendor-1', userId: 'user-1', businessName: 'Test Kitchen' },
    });
    const svc = new VendorEnforcementService(prisma as any, makeNotifications());
    await expect(svc.liftAction('action-1', 'staff@feastpot.co.uk')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

// ── 7. Serious-cause constants are a subset of urgent codes ──────────────────

describe('Reason code constants', () => {
  it('SERIOUS_CAUSE_CODES are all in URGENT_REASON_CODES', () => {
    for (const code of SERIOUS_CAUSE_CODES) {
      expect(URGENT_REASON_CODES).toContain(code);
    }
  });
});
