/**
 * Appeal policy invariants (vendor terms v2.0, clauses 18.1-18.3).
 *
 * These tests enforce the four acceptance criteria from the task brief:
 *   1. The phrase "decision is final" must not appear in any source file.
 *   2. Stage 2 with the same reviewer as Stage 1 is rejected (SAME_REVIEWER).
 *   3. The appeal window always exceeds the acknowledgement commitment.
 *   4. An upheld Stage 2 outcome triggers payout deduction reversal.
 */

import { execSync } from 'child_process';

import { AppealOutcome, PayoutStatus } from '@prisma/client';

import { APPEAL_ACK_BUSINESS_DAYS, APPEAL_WINDOW_DAYS, DisputeAppealsService } from './dispute-appeals.service';

// ─── Helpers for building minimal mocks ──────────────────────────────────────

function makePrismaMock(overrides: Record<string, unknown> = {}) {
  return {
    dispute: {
      findUnique: jest.fn(),
    },
    disputeAppeal: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payout: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    ...overrides,
  } as unknown as import('../../prisma/prisma.service').PrismaService;
}

function makeNotificationsMock() {
  return { enqueue: jest.fn().mockResolvedValue(undefined) } as unknown as import('../notifications/notifications.service').NotificationsService;
}

function _makeAdmin(id = 'admin-1') {
  return { id, role: 'admin' as const };
}

function makeAppeal(overrides = {}) {
  return {
    id: 'appeal-1',
    disputeId: 'dispute-1',
    submittedAt: new Date(),
    deadline: new Date(Date.now() + 14 * 86_400_000),
    grounds: 'grounds text here longer than 50 chars for validation purposes',
    stage1By: null,
    stage1At: null,
    stage1Outcome: null,
    stage1Reasons: null,
    stage2By: null,
    stage2At: null,
    stage2Outcome: null,
    stage2Reasons: null,
    ...overrides,
  };
}

function _makeService(prismaOverrides = {}) {
  return new DisputeAppealsService(
    makePrismaMock(prismaOverrides),
    makeNotificationsMock(),
  );
}

// ─── 1. "Decision is final" exclusion ────────────────────────────────────────

describe('Acceptance criterion: "decision is final" must not appear in any source file', () => {
  it('the phrase is absent from all TypeScript source files', () => {
    // Clause 4 ("decision is final") was replaced by v2.0 clauses 18.1-18.3.
    // This test prevents the old language from being reintroduced.
    let output = '';
    try {
      const rootDir = process.cwd().replace(/\/apps\/api$/, '').replace(/\/src$/, '');
      output = execSync(
        'grep -r "decision is final" apps/ packages/ --include="*.ts" --include="*.tsx" --exclude="*.spec.ts" --exclude="*.test.ts" -l 2>/dev/null || true',
        { encoding: 'utf8', cwd: rootDir },
      ).trim();
    } catch {
      output = '';
    }
    expect(output).toBe('');
  });
});

// ─── 2. Stage 2 different-reviewer rule ──────────────────────────────────────

describe('Acceptance criterion: Stage 2 reviewer must differ from Stage 1', () => {
  it('throws SAME_REVIEWER when the same user attempts Stage 2', async () => {
    const stage1ReviewerId = 'reviewer-alice';
    const prisma = makePrismaMock({
      disputeAppeal: {
        findUnique: jest.fn().mockResolvedValue(
          makeAppeal({
            stage1By: stage1ReviewerId,
            stage1At: new Date(),
            stage1Outcome: AppealOutcome.OVERTURNED,
            stage1Reasons: 'x'.repeat(60),
          }),
        ),
        update: jest.fn(),
      },
    });
    const service = new DisputeAppealsService(prisma, makeNotificationsMock());

    await expect(
      service.decideStage2(
        'dispute-1',
        { outcome: AppealOutcome.UPHELD, reasons: 'y'.repeat(60) },
        { id: stage1ReviewerId, role: 'admin' as const },
      ),
    ).rejects.toMatchObject({ response: { code: 'SAME_REVIEWER' } });
  });

  it('accepts Stage 2 when reviewer differs from Stage 1', async () => {
    const prisma = makePrismaMock({
      dispute: {
        findUnique: jest.fn().mockResolvedValue({
          refundPence: 0,
          order: { vendor: { id: 'v1', businessName: 'Test', userId: 'u1' } },
        }),
      },
      disputeAppeal: {
        findUnique: jest.fn().mockResolvedValue(
          makeAppeal({
            stage1By: 'alice',
            stage1At: new Date(),
            stage1Outcome: AppealOutcome.OVERTURNED,
            stage1Reasons: 'x'.repeat(60),
          }),
        ),
        update: jest.fn().mockResolvedValue(makeAppeal({ stage2By: 'bob', stage2Outcome: AppealOutcome.OVERTURNED })),
      },
      payout: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
    });
    const service = new DisputeAppealsService(prisma, makeNotificationsMock());

    const result = await service.decideStage2(
      'dispute-1',
      { outcome: AppealOutcome.OVERTURNED, reasons: 'y'.repeat(60) },
      { id: 'bob', role: 'admin' as const },
    );
    expect(result).toBeDefined();
  });
});

// ─── 3. Appeal window invariant ──────────────────────────────────────────────

describe('Acceptance criterion: appeal window always exceeds acknowledgement commitment', () => {
  it(`${APPEAL_WINDOW_DAYS}-day window exceeds ${APPEAL_ACK_BUSINESS_DAYS}-business-day ack commitment`, () => {
    // 5 business days span at most 7 calendar days (Mon to Fri = 5 days;
    // worst case Mon to the following Fri if holidays intervene = 7 cal days).
    const ackMaxCalendarDays = Math.ceil(APPEAL_ACK_BUSINESS_DAYS * 7 / 5);
    expect(APPEAL_WINDOW_DAYS).toBeGreaterThan(ackMaxCalendarDays);
  });
});

// ─── 4. Upheld appeal reverses payout deduction ───────────────────────────────

describe('Acceptance criterion: upheld Stage 2 appeal reverses payout deduction', () => {
  it('calls payout.update to credit the vendor when a draft payout exists', async () => {
    const mockUpdate = jest.fn().mockResolvedValue({});
    const prisma = makePrismaMock({
      dispute: {
        findUnique: jest.fn().mockResolvedValue({
          refundPence: 1500,
          order: { vendor: { id: 'vendor-1', businessName: 'Curry House', userId: 'u1' } },
        }),
      },
      disputeAppeal: {
        findUnique: jest.fn().mockResolvedValue(
          makeAppeal({
            stage1By: 'alice',
            stage1At: new Date(),
            stage1Outcome: AppealOutcome.OVERTURNED,
            stage1Reasons: 'x'.repeat(60),
          }),
        ),
        update: jest.fn().mockResolvedValue(makeAppeal({ stage2By: 'bob', stage2Outcome: AppealOutcome.UPHELD })),
      },
      payout: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'payout-1',
          amountPence: 10000,
          refundsPence: 1500,
          status: PayoutStatus.draft,
        }),
        update: mockUpdate,
        create: jest.fn(),
      },
    });

    const service = new DisputeAppealsService(prisma, makeNotificationsMock());
    await service.decideStage2(
      'dispute-1',
      { outcome: AppealOutcome.UPHELD, reasons: 'y'.repeat(60) },
      { id: 'bob', role: 'admin' as const },
    );

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'payout-1' } }),
    );
    const updateArg = mockUpdate.mock.calls[0]?.[0] as { data: { amountPence: { increment: number } } };
    expect(updateArg.data.amountPence.increment).toBe(1500);
  });

  it('creates a new draft payout credit when no draft exists', async () => {
    const mockCreate = jest.fn().mockResolvedValue({});
    const prisma = makePrismaMock({
      dispute: {
        findUnique: jest.fn().mockResolvedValue({
          refundPence: 800,
          order: { vendor: { id: 'vendor-2', businessName: 'Pizza Place', userId: 'u2' } },
        }),
      },
      disputeAppeal: {
        findUnique: jest.fn().mockResolvedValue(
          makeAppeal({
            stage1By: 'alice',
            stage1At: new Date(),
            stage1Outcome: AppealOutcome.OVERTURNED,
            stage1Reasons: 'x'.repeat(60),
          }),
        ),
        update: jest.fn().mockResolvedValue(makeAppeal({ stage2By: 'bob', stage2Outcome: AppealOutcome.UPHELD })),
      },
      payout: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: mockCreate,
        update: jest.fn(),
      },
    });

    const service = new DisputeAppealsService(prisma, makeNotificationsMock());
    await service.decideStage2(
      'dispute-1',
      { outcome: AppealOutcome.UPHELD, reasons: 'y'.repeat(60) },
      { id: 'bob', role: 'admin' as const },
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vendorId: 'vendor-2',
          amountPence: 800,
          status: PayoutStatus.draft,
        }),
      }),
    );
  });

  it('does NOT reverse payout when Stage 2 outcome is OVERTURNED', async () => {
    const mockPayoutUpdate = jest.fn();
    const mockPayoutCreate = jest.fn();
    const prisma = makePrismaMock({
      dispute: { findUnique: jest.fn() },
      disputeAppeal: {
        findUnique: jest.fn().mockResolvedValue(
          makeAppeal({
            stage1By: 'alice',
            stage1At: new Date(),
            stage1Outcome: AppealOutcome.UPHELD,
            stage1Reasons: 'x'.repeat(60),
          }),
        ),
        update: jest.fn().mockResolvedValue(makeAppeal({ stage2By: 'bob', stage2Outcome: AppealOutcome.OVERTURNED })),
      },
      payout: { findFirst: mockPayoutUpdate, create: mockPayoutCreate, update: jest.fn() },
    });

    const service = new DisputeAppealsService(prisma, makeNotificationsMock());
    await service.decideStage2(
      'dispute-1',
      { outcome: AppealOutcome.OVERTURNED, reasons: 'y'.repeat(60) },
      { id: 'bob', role: 'admin' as const },
    );

    // Neither payout.findFirst (which starts the reversal chain) should be called
    // when the outcome is not UPHELD
    expect(mockPayoutUpdate).not.toHaveBeenCalled();
    expect(mockPayoutCreate).not.toHaveBeenCalled();
  });
});
