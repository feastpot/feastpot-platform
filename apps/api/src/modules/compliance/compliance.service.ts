import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DocumentStatus, ModerationStatus, OrderStatus, UserRole } from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import { SupabaseService } from '../../auth/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

import type { UploadDocumentDto } from './dto/upload-document.dto';
import type { VerifyDocumentDto } from './dto/verify-document.dto';

const SUPABASE_DOCS_BUCKET = 'feastpot-documents';

/** Days-until-expiry threshold at which we start nagging vendors. */
const EXPIRY_WARNING_DAYS = 30;
/** A vendor counts as "community favourite" with these thresholds. */
const FAVOURITE_RATING_THRESHOLD = 4.3;
const FAVOURITE_REORDER_PCT_THRESHOLD = 40;
/** Window after delivery to ask for a review. */
const REVIEW_REQUEST_AFTER_HOURS = 2;

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly supabase: SupabaseService,
  ) {}

  // -------------------- vendor documents --------------------

  async listDocuments(vendorId: string, user: AuthUser) {
    await this.assertCanManageVendor(vendorId, user);
    return this.prisma.vendorDocument.findMany({ where: { vendorId }, orderBy: { createdAt: 'desc' } });
  }

  async uploadDocument(
    vendorId: string,
    file: { originalname: string; buffer: Buffer; mimetype: string; size: number },
    dto: UploadDocumentDto,
    user: AuthUser,
  ) {
    await this.assertCanManageVendor(vendorId, user);
    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Max 10 MB per document' });
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    const path = `vendors/${vendorId}/${dto.type}/${Date.now()}-${safeName}`;
    const storage = this.supabase.getClient().storage.from(SUPABASE_DOCS_BUCKET);
    const { error } = await storage.upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) throw new BadRequestException({ code: 'UPLOAD_FAILED', message: error.message });
    const { data } = storage.getPublicUrl(path);

    return this.prisma.vendorDocument.create({
      data: {
        vendorId,
        type: dto.type,
        status: DocumentStatus.pending,
        fileUrl: data.publicUrl,
        fileName: file.originalname.slice(0, 255),
        expiresAt: dto.expiresAt ?? null,
      },
    });
  }

  async verifyDocument(vendorId: string, documentId: string, dto: VerifyDocumentDto, user: AuthUser) {
    const complianceRoles: UserRole[] = [UserRole.compliance, UserRole.admin];
    if (!complianceRoles.includes(user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Only compliance/admin may verify documents' });
    }
    const validStatuses: DocumentStatus[] = [DocumentStatus.verified, DocumentStatus.rejected];
    if (!validStatuses.includes(dto.status)) {
      throw new BadRequestException({
        code: 'INVALID_STATUS',
        message: 'status must be verified or rejected',
      });
    }
    const doc = await this.prisma.vendorDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.vendorId !== vendorId) {
      throw new NotFoundException({ code: 'DOCUMENT_NOT_FOUND', message: 'Document not found for this vendor' });
    }
    return this.prisma.vendorDocument.update({
      where: { id: documentId },
      data: {
        status: dto.status,
        rejectReason: dto.status === DocumentStatus.rejected ? dto.rejectReason ?? null : null,
        reviewedBy: user.id,
        reviewedAt: new Date(),
      },
    });
  }

  // -------------------- cron jobs --------------------

  /** Daily 06:00 UTC: scan for expiring documents and notify. */
  async runComplianceScan(): Promise<{ expiringNotified: number; expiredNotified: number }> {
    const now = new Date();
    const warnBefore = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000);

    const expiring = await this.prisma.vendorDocument.findMany({
      where: {
        status: DocumentStatus.verified,
        expiresAt: { not: null, gte: now, lte: warnBefore },
      },
      include: { vendor: { select: { id: true, userId: true, businessName: true } } },
    });
    for (const d of expiring) {
      const days = Math.max(0, Math.ceil((d.expiresAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
      await this.notifications.enqueue('document_expiring', {
        userId: d.vendor.userId,
        documentType: d.type,
        expiresAt: d.expiresAt,
        daysUntilExpiry: days,
      });
    }

    const expired = await this.prisma.vendorDocument.findMany({
      where: { status: DocumentStatus.verified, expiresAt: { not: null, lt: now } },
      include: { vendor: { select: { id: true, businessName: true } } },
    });
    if (expired.length > 0) {
      // Mark as expired in DB so we don't notify forever.
      await this.prisma.vendorDocument.updateMany({
        where: { id: { in: expired.map((e) => e.id) } },
        data: { status: DocumentStatus.expired },
      });
      // Notify all compliance admins (not the vendor — vendor was already
      // notified during the warning window; this is to flag the gap to staff).
      const admins = await this.prisma.user.findMany({
        where: { role: { in: [UserRole.compliance, UserRole.admin] }, status: 'active' },
        select: { id: true },
      });
      for (const d of expired) {
        for (const a of admins) {
          await this.notifications.enqueue('document_expired', {
            userId: a.id,
            documentType: d.type,
            vendorId: d.vendorId,
            vendorName: d.vendor.businessName,
          });
        }
      }
    }

    return { expiringNotified: expiring.length, expiredNotified: expired.length };
  }

  /**
   * Every 15 minutes: ask for a review on orders delivered ≥2h ago without one.
   *
   * IDEMPOTENCY: This cron MUST NOT spam customers if it ticks every 15 min
   * for up to 7 days per order. Two layers of dedupe:
   *
   *  1. DB check: skip orders that already have a `review_request` notification
   *     row for the customer (Notification.metadata.orderId == this order).
   *  2. BullMQ jobId `review_request:<orderId>` — even if two pods/ticks race
   *     past the DB check (or the notification row hasn't been written yet),
   *     BullMQ will reject the duplicate while the first job is queued/active.
   */
  async runReviewTrigger(): Promise<{ requested: number; skippedAlreadyRequested: number }> {
    const cutoff = new Date(Date.now() - REVIEW_REQUEST_AFTER_HOURS * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.delivered,
        // Window: delivered ≥2h ago but ≤7 days ago. Older orders are stale.
        deliveredAt: { gte: sevenDaysAgo, lte: cutoff },
        reviews: { none: {} },
      },
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
        vendor: { select: { businessName: true } },
      },
      take: 200, // cap per tick to bound queue pressure
    });
    if (orders.length === 0) return { requested: 0, skippedAlreadyRequested: 0 };

    // Single bulk query: which (customer, orderId) pairs already got a review_request?
    // Prisma's JsonFilter doesn't support `in` on a JSON path, so we OR
    // per-orderId equals filters. Cheap because `take:200` bounds the OR width.
    const existing = await this.prisma.notification.findMany({
      where: {
        template: 'review_request',
        userId: { in: orders.map((o) => o.customerId) },
        OR: orders.map((o) => ({ metadata: { path: ['orderId'], equals: o.id } })),
      },
      select: { userId: true, metadata: true },
    });
    const alreadySent = new Set<string>(
      existing
        .map((n) => {
          const m = n.metadata as { orderId?: unknown } | null;
          return typeof m?.orderId === 'string' ? `${n.userId}:${m.orderId}` : null;
        })
        .filter((s): s is string => s !== null),
    );

    let requested = 0;
    let skipped = 0;
    for (const o of orders) {
      if (alreadySent.has(`${o.customerId}:${o.id}`)) {
        skipped++;
        continue;
      }
      await this.notifications.enqueue(
        'review_request',
        {
          userId: o.customerId,
          orderId: o.id,
          orderNumber: o.orderNumber,
          vendorName: o.vendor.businessName,
        },
        { jobId: `review_request:${o.id}` },
      );
      requested++;
    }
    return { requested, skippedAlreadyRequested: skipped };
  }

  /**
   * Nightly 01:00 UTC: recompute reorderRatePct + communityFavourite for live vendors.
   * `rating` itself is recalculated synchronously on each new review — this
   * cron just guarantees we don't drift if a recalc was missed (e.g. during
   * an outage) and updates the derived "favourite" badge.
   */
  async runBadgeRecalc(): Promise<{ updated: number }> {
    const vendors = await this.prisma.vendor.findMany({
      where: { status: 'live' },
      select: { id: true },
    });
    let updated = 0;
    for (const v of vendors) {
      // Avg rating from PUBLISHED reviews only.
      const reviewAgg = await this.prisma.review.aggregate({
        where: {
          vendorId: v.id,
          moderationStatus: { in: [ModerationStatus.auto_approved, ModerationStatus.approved] },
          isHidden: false,
        },
        _avg: { rating: true },
        _count: { _all: true },
      });
      const avgRating = Number((reviewAgg._avg.rating ?? 0).toFixed(2));

      // Reorder rate: customers with 2+ delivered orders / total unique customers (delivered).
      const delivered = await this.prisma.order.findMany({
        where: { vendorId: v.id, status: OrderStatus.delivered },
        select: { customerId: true },
      });
      const counts = new Map<string, number>();
      for (const d of delivered) counts.set(d.customerId, (counts.get(d.customerId) ?? 0) + 1);
      const totalCustomers = counts.size;
      const repeatCustomers = Array.from(counts.values()).filter((n) => n >= 2).length;
      const reorderRatePct = totalCustomers === 0 ? 0 : Number(((repeatCustomers / totalCustomers) * 100).toFixed(2));

      const communityFavourite =
        avgRating >= FAVOURITE_RATING_THRESHOLD && reorderRatePct >= FAVOURITE_REORDER_PCT_THRESHOLD;

      await this.prisma.vendor.update({
        where: { id: v.id },
        data: {
          rating: avgRating,
          ratingCount: reviewAgg._count._all,
          reorderRatePct,
          communityFavourite,
        },
      });
      updated++;
    }
    return { updated };
  }

  // -------------------- helpers --------------------

  private async assertCanManageVendor(vendorId: string, user: AuthUser): Promise<void> {
    const staffRoles: UserRole[] = [UserRole.admin, UserRole.compliance];
    if (staffRoles.includes(user.role)) return;
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId }, select: { userId: true } });
    if (!vendor) throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
    if (user.role === UserRole.vendor && vendor.userId === user.id) return;
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You may not manage this vendor' });
  }
}
