import * as Sentry from '@sentry/nestjs';

import { ChargebackDeadlineMonitorService } from './chargeback-deadline-monitor.service';

jest.mock('@sentry/nestjs', () => ({ captureMessage: jest.fn() }));

const captureMessage = Sentry.captureMessage as jest.Mock;

describe('ChargebackDeadlineMonitorService', () => {
  const warnHoursEnv = process.env.CHARGEBACK_EVIDENCE_WARN_HOURS;

  beforeEach(() => {
    process.env.CHARGEBACK_EVIDENCE_WARN_HOURS = '72';
    captureMessage.mockClear();
  });

  afterAll(() => {
    if (warnHoursEnv === undefined) delete process.env.CHARGEBACK_EVIDENCE_WARN_HOURS;
    else process.env.CHARGEBACK_EVIDENCE_WARN_HOURS = warnHoursEnv;
  });

  function build(prisma: Record<string, unknown>) {
    const inbox = { notify: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn().mockReturnValue(null) };
    const service = new ChargebackDeadlineMonitorService(
      prisma as never,
      inbox as never,
      config as never,
    );
    return { service, inbox, config };
  }

  it('alerts each active finance and admin user exactly once when an evidence deadline is approaching', async () => {
    const chargeback = {
      id: 'cb-1',
      stripeDisputeId: 'dp_123',
      orderId: 'order-1',
      amountPence: 2599,
      currency: 'gbp',
      reason: 'fraudulent',
      evidenceDueBy: new Date(Date.now() + 24 * 60 * 60 * 1000),
      order: { orderNumber: 'FP-1001' },
    };
    const prisma = {
      chargeback: {
        findMany: jest.fn().mockResolvedValue([chargeback]),
        // The second tick sees the same row, but loses the atomic claim.
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'finance-1' }, { id: 'admin-1' }]),
      },
    };
    const { service, inbox } = build(prisma);

    await service.checkEvidenceDeadlines();
    await service.checkEvidenceDeadlines();

    expect(prisma.chargeback.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.chargeback.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'cb-1', evidenceWarnedAt: null },
      data: { evidenceWarnedAt: expect.any(Date) },
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: { in: ['finance', 'admin'] }, status: 'active' },
      select: { id: true },
    });
    expect(inbox.notify).toHaveBeenCalledTimes(2);
    expect(inbox.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'finance-1',
        metadata: expect.objectContaining({ chargebackId: 'cb-1', stripeDisputeId: 'dp_123' }),
      }),
    );
    expect(inbox.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        metadata: expect.objectContaining({ chargebackId: 'cb-1', stripeDisputeId: 'dp_123' }),
      }),
    );
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });

  it('excludes closed disputes and deadlines outside the warning window', async () => {
    const now = Date.now();
    const chargebacks = [
      {
        id: 'approaching',
        closedAt: null,
        evidenceWarnedAt: null,
        evidenceDueBy: new Date(now + 24 * 60 * 60 * 1000),
        status: 'needs_response',
      },
      {
        id: 'closed',
        closedAt: new Date(now),
        evidenceWarnedAt: null,
        evidenceDueBy: new Date(now + 24 * 60 * 60 * 1000),
        status: 'needs_response',
      },
      {
        id: 'outside-window',
        closedAt: null,
        evidenceWarnedAt: null,
        evidenceDueBy: new Date(now + 73 * 60 * 60 * 1000),
        status: 'needs_response',
      },
    ];
    const findMany = jest.fn(({ where }: { where: { evidenceDueBy: { lte: Date } } }) =>
      Promise.resolve(
        chargebacks
          .filter(
            (cb) =>
              cb.closedAt === null &&
              cb.evidenceWarnedAt === null &&
              cb.evidenceDueBy <= where.evidenceDueBy.lte,
          )
          .map((cb) => ({
            ...cb,
            stripeDisputeId: `dp_${cb.id}`,
            orderId: null,
            amountPence: 1000,
            currency: 'gbp',
            reason: null,
            order: null,
          })),
      ),
    );
    const prisma = {
      chargeback: { findMany, updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const { service, inbox } = build(prisma);

    await service.checkEvidenceDeadlines();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          evidenceWarnedAt: null,
          closedAt: null,
          evidenceDueBy: { not: null, lte: expect.any(Date) },
          status: { in: ['needs_response', 'warning_needs_response', 'warning_under_review'] },
        }),
      }),
    );
    expect(prisma.chargeback.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.chargeback.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'approaching', evidenceWarnedAt: null } }),
    );
    expect(inbox.notify).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledTimes(1);
  });
});
