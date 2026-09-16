import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  NotificationChannel,
  RecoveryNudgeStage,
  VendorOnboardingStepName,
  VendorRequiredItemState,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationEvent } from '../notifications/notification-events';
import { NotificationsService } from '../notifications/notifications.service';

const STAGES: Array<[RecoveryNudgeStage, number, NotificationChannel]> = [
  [RecoveryNudgeStage.sms_2h, 2, NotificationChannel.sms],
  [RecoveryNudgeStage.email_24h, 24, NotificationChannel.email],
  [RecoveryNudgeStage.email_3d_help, 72, NotificationChannel.email],
  [RecoveryNudgeStage.email_7d_final, 168, NotificationChannel.email],
  // This is an admin queue marker, not a fifth vendor notification.
  [RecoveryNudgeStage.admin_chase, 168, NotificationChannel.email],
];

/** Durable, idempotent recovery nudges for the first outstanding required item. */
@Injectable()
export class VendorRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId }, select: { id: true } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return this.prisma.vendorRequiredOnboardingItem.findMany({
      where: { vendorId: vendor.id },
      orderBy: { name: 'asc' },
    });
  }

  async setItem(userId: string, name: VendorOnboardingStepName, state: VendorRequiredItemState) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId }, select: { id: true } });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (state === VendorRequiredItemState.supplied) {
      throw new BadRequestException('supplied is derived from verified onboarding evidence');
    }
    const row = await this.prisma.vendorRequiredOnboardingItem.upsert({
      where: { vendorId_name: { vendorId: vendor.id, name } },
      create: {
        vendorId: vendor.id,
        name,
        state,
        suppliedAt: null,
        deferredAt: state === 'deferred' ? new Date() : null,
      },
      update: { state, suppliedAt: null, deferredAt: state === 'deferred' ? new Date() : null },
    });
    return row;
  }

  /** Reconciles the recovery projection from canonical onboarding state. */
  async syncItem(vendorId: string, name: VendorOnboardingStepName, supplied: boolean) {
    const now = new Date();
    const existing = await this.prisma.vendorRequiredOnboardingItem.findUnique({
      where: { vendorId_name: { vendorId, name } },
      select: { state: true },
    });
    await this.prisma.vendorRequiredOnboardingItem.upsert({
      where: { vendorId_name: { vendorId, name } },
      create: {
        vendorId,
        name,
        state: supplied ? 'supplied' : 'outstanding',
        suppliedAt: supplied ? now : null,
      },
      update: supplied
        ? { state: 'supplied', suppliedAt: now, deferredAt: null }
        : existing?.state === 'deferred'
          ? { suppliedAt: null }
          : { state: 'outstanding', suppliedAt: null },
    });
    if (supplied) await this.cancelWhenSupplied(vendorId, name);
  }

  async schedule(vendorId: string, item: VendorOnboardingStepName, from = new Date()) {
    const existing = await this.prisma.vendorRecoverySchedule.findFirst({
      where: { vendorId, cancelledAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && existing.targetedItem === item && !existing.cancelledAt) return existing;
    await this.prisma.vendorRecoverySchedule.updateMany({
      where: { vendorId, cancelledAt: null },
      data: { cancelledAt: from },
    });
    const schedule = await this.prisma.vendorRecoverySchedule.create({
      data: { vendorId, targetedItem: item, createdAt: from, updatedAt: from },
    });
    await this.prisma.$transaction(
      STAGES.map(([stage, hours, channel]) =>
        this.prisma.vendorRecoveryStage.upsert({
          where: { scheduleId_stage: { scheduleId: schedule.id, stage } },
          create: {
            scheduleId: schedule.id,
            stage,
            channel,
            dueAt: new Date(from.getTime() + hours * 3600000),
          },
          update: {
            channel,
            dueAt: new Date(from.getTime() + hours * 3600000),
            sentAt: null,
            skippedAt: null,
          },
        }),
      ),
    );
    return schedule;
  }

  /** Explicit, operator-invoked reconciliation for legacy stalled vendors. */
  async reconcileStalledVendors(now = new Date()) {
    const vendors = await this.prisma.vendor.findMany({
      where: { status: { in: ['approved', 'live', 'probation'] } },
      select: { id: true },
    });
    let initialized = 0;
    for (const vendor of vendors) {
      const active = await this.prisma.vendorRecoverySchedule.findFirst({
        where: { vendorId: vendor.id, cancelledAt: null },
      });
      if (active) continue;
      const item = await this.prisma.vendorRequiredOnboardingItem.findFirst({
        where: { vendorId: vendor.id, state: { not: 'supplied' } },
        orderBy: { name: 'asc' },
      });
      if (item) {
        await this.schedule(vendor.id, item.name, now);
        initialized++;
      }
    }
    return { initialized };
  }

  async cancelWhenSupplied(vendorId: string, item: VendorOnboardingStepName) {
    await this.prisma.vendorRecoverySchedule.updateMany({
      where: { vendorId, targetedItem: item },
      data: { cancelledAt: new Date() },
    });
    await this.prisma.vendorRecoveryStage.updateMany({
      where: { schedule: { vendorId, targetedItem: item }, sentAt: null },
      data: { skippedAt: new Date() },
    });
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'vendor-recovery-nudges' })
  async dispatchDue(now = new Date()) {
    const due = await this.prisma.vendorRecoveryStage.findMany({
      where: {
        dueAt: { lte: now },
        sentAt: null,
        queuedAt: null,
        skippedAt: null,
        stage: { not: RecoveryNudgeStage.admin_chase },
        schedule: { cancelledAt: null },
      },
      include: {
        schedule: {
          include: {
            vendor: {
              select: {
                userId: true,
                user: { select: { phone: true, phoneVerified: true } },
                application: { select: { marketingConsent: true } },
              },
            },
          },
        },
      },
    });
    const sent: string[] = [];
    for (const stage of due) {
      if (
        stage.stage === RecoveryNudgeStage.sms_2h &&
        (!stage.schedule.vendor.user.phone ||
          !stage.schedule.vendor.user.phoneVerified ||
          stage.schedule.vendor.application?.marketingConsent !== true)
      ) {
        await this.prisma.vendorRecoveryStage.updateMany({
          where: { id: stage.id, sentAt: null, skippedAt: null },
          data: { skippedAt: now },
        });
        continue;
      }
      await this.notifications.enqueue(
        NotificationEvent.vendor_onboarding_recovery,
        {
          userId: stage.schedule.vendor.userId,
          requiredItem: stage.schedule.targetedItem,
          recoveryStage: stage.stage,
          recoveryStageId: stage.id,
          portalUrl: `https://vendor.feastpot.co.uk/onboarding?item=${encodeURIComponent(stage.schedule.targetedItem)}`,
        },
        { jobId: `vendor-recovery:${stage.id}` },
      );
      await this.prisma.vendorRecoveryStage.updateMany({
        where: { id: stage.id, sentAt: null, skippedAt: null },
        data: { queuedAt: now },
      });
      sent.push(stage.id);
    }
    return sent;
  }
}
