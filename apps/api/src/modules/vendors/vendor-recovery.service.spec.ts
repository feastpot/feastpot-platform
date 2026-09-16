import { NotificationChannel, RecoveryNudgeStage, VendorOnboardingStepName } from '@prisma/client';

import { VendorRecoveryService } from './vendor-recovery.service';

describe('VendorRecoveryService', () => {
  const prisma: any = {
    vendor: { findUnique: jest.fn() },
    vendorRecoverySchedule: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    vendorRecoveryStage: { upsert: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    vendorRequiredOnboardingItem: { findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn((ops) => Promise.all(ops)),
  };
  const notifications = { enqueue: jest.fn() };
  let service: VendorRecoveryService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VendorRecoveryService(prisma, notifications as never);
    prisma.vendorRecoverySchedule.findUnique.mockResolvedValue(null);
    prisma.vendorRecoverySchedule.findFirst.mockResolvedValue(null);
    prisma.vendorRecoverySchedule.create.mockResolvedValue({
      id: 's1',
      targetedItem: VendorOnboardingStepName.public_liability_insurance,
    });
    prisma.vendorRecoveryStage.upsert.mockImplementation(({ create }: any) =>
      Promise.resolve(create),
    );
  });

  it('creates four nudges plus an admin chase marker at exact offsets', async () => {
    const start = new Date('2026-01-01T00:00:00Z');
    await service.schedule('v1', VendorOnboardingStepName.public_liability_insurance, start);
    const creates = prisma.vendorRecoveryStage.upsert.mock.calls.map(([x]: any) => x.create);
    expect(creates.map((x: any) => x.stage)).toEqual([
      RecoveryNudgeStage.sms_2h,
      RecoveryNudgeStage.email_24h,
      RecoveryNudgeStage.email_3d_help,
      RecoveryNudgeStage.email_7d_final,
      RecoveryNudgeStage.admin_chase,
    ]);
    expect(creates.map((x: any) => x.dueAt.getTime() - start.getTime())).toEqual([
      2 * 3600000,
      24 * 3600000,
      72 * 3600000,
      168 * 3600000,
      168 * 3600000,
    ]);
    expect(creates.slice(0, 1)[0].channel).toBe(NotificationChannel.sms);
    expect(creates.slice(1).every((x: any) => x.channel === NotificationChannel.email)).toBe(true);
  });

  it('only marks sent after enqueue succeeds and retries failed enqueue', async () => {
    prisma.vendorRecoveryStage.findMany.mockResolvedValue([
      {
        id: 'st1',
        stage: RecoveryNudgeStage.email_24h,
        schedule: {
          targetedItem: VendorOnboardingStepName.photo_id_verification,
          vendor: { userId: 'u1' },
        },
      },
    ]);
    notifications.enqueue.mockRejectedValueOnce(new Error('offline'));
    await expect(service.dispatchDue()).rejects.toThrow('offline');
    expect(prisma.vendorRecoveryStage.updateMany).not.toHaveBeenCalled();
    notifications.enqueue.mockResolvedValue(undefined);
    await service.dispatchDue();
    expect(prisma.vendorRecoveryStage.updateMany).toHaveBeenCalled();
    expect(notifications.enqueue.mock.calls[1][0]).toBe('vendor_onboarding_recovery');
    expect(notifications.enqueue.mock.calls[1][1].portalUrl).toContain('photo_id_verification');
  });

  it('cancels and skips all unsent stages when supplied', async () => {
    await service.cancelWhenSupplied('v1', VendorOnboardingStepName.food_safety_certificate);
    expect(prisma.vendorRecoverySchedule.updateMany).toHaveBeenCalled();
    expect(prisma.vendorRecoveryStage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ skippedAt: expect.any(Date) }),
      }),
    );
  });

  it('retargets a schedule to the next outstanding item', async () => {
    prisma.vendorRecoverySchedule.findFirst.mockResolvedValue({
      id: 's1',
      targetedItem: VendorOnboardingStepName.food_safety_certificate,
      cancelledAt: null,
    });
    await service.schedule('v1', VendorOnboardingStepName.photo_id_verification);
    expect(prisma.vendorRecoverySchedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetedItem: VendorOnboardingStepName.photo_id_verification,
        }),
      }),
    );
  });

  it('initialises a historical vendor from now, never with immediately overdue nudges', async () => {
    prisma.vendor.findMany = jest.fn().mockResolvedValue([{ id: 'old-vendor' }]);
    prisma.vendorRequiredOnboardingItem.findFirst.mockResolvedValue({
      name: VendorOnboardingStepName.public_liability_insurance,
      state: 'outstanding',
    });
    prisma.vendorRecoverySchedule.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const now = new Date('2026-01-01T00:00:00Z');
    await service.reconcileStalledVendors(now);
    const creates = prisma.vendorRecoveryStage.upsert.mock.calls.map(([x]: any) => x.create);
    expect(creates[0].dueAt).toEqual(new Date('2026-01-01T02:00:00Z'));
    expect(creates.every((stage: any) => stage.dueAt >= now)).toBe(true);
  });
});
