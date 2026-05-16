import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DisputeStatus,
  EvidenceType,
  IssueType,
  OrderStatus,
  Prisma,
  ResolutionType,
  Severity,
  UserRole,
} from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import { SupabaseService } from '../../auth/supabase.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../../prisma/prisma.service';

import type { CloseDisputeDto } from './dto/close-dispute.dto';
import type { CreateDisputeDto } from './dto/create-dispute.dto';
import type { ListDisputesDto } from './dto/list-disputes.dto';
import type { UpdateDisputeDto } from './dto/update-dispute.dto';
import type { VendorResponseDto } from './dto/vendor-response.dto';

const SUPABASE_DOCS_BUCKET = 'feastpot-documents';

/** Allowed transitions from each status. open is reachable from itself for idempotent updates. */
const STATUS_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  [DisputeStatus.open]: [DisputeStatus.vendor_contacted, DisputeStatus.escalated, DisputeStatus.resolved, DisputeStatus.closed],
  [DisputeStatus.vendor_contacted]: [DisputeStatus.resolved, DisputeStatus.escalated, DisputeStatus.closed],
  [DisputeStatus.escalated]: [DisputeStatus.resolved, DisputeStatus.closed],
  [DisputeStatus.resolved]: [DisputeStatus.closed],
  [DisputeStatus.closed]: [], // terminal
};

const SEVERITY_BY_ISSUE: Record<IssueType, Severity> = {
  [IssueType.not_delivered]: Severity.high,
  [IssueType.missing_items]: Severity.medium,
  [IssueType.wrong_order]: Severity.medium,
  [IssueType.quality]: Severity.low,
  [IssueType.other]: Severity.low,
};

const REFUND_RESOLUTIONS = new Set<ResolutionType>([ResolutionType.full_refund, ResolutionType.partial_refund]);

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly notifications: NotificationsService,
    private readonly supabase: SupabaseService,
  ) {}

  // -------------------- list --------------------

  async list(user: AuthUser, dto: ListDisputesDto) {
    const limit = dto.limit ?? 20;
    const where: Prisma.DisputeWhereInput = {};
    if (dto.status) where.status = dto.status;
    if (dto.severity) where.severity = dto.severity;

    // Customers see their own only; vendors see disputes on their orders;
    // support/admin/compliance see everything.
    if (user.role === UserRole.customer) {
      where.raisedById = user.id;
    } else if (user.role === UserRole.vendor) {
      where.order = { vendor: { userId: user.id } };
    } else if (dto.assignedToId) {
      // Only staff can filter by assignee — for customers/vendors the scope
      // above already restricts results to "their" disputes, so an
      // assignedToId filter would either be redundant or empty.
      where.assignedToId = dto.assignedToId;
    }

    const cursor = dto.cursor ? this.decodeCursor(dto.cursor) : undefined;
    const cursorWhere: Prisma.DisputeWhereInput = cursor
      ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
      : {};

    const rows = await this.prisma.dispute.findMany({
      where: { AND: [where, cursorWhere] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalPence: true,
            vendorId: true,
            vendor: { select: { id: true, businessName: true } },
            customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
    });
    // `vendorRespondedAt` and `resolvedAt` are scalar columns on Dispute and
    // come through automatically — explicitly mentioned here so the admin
    // SLA indicator (D15) keeps working if anyone narrows this to a `select`.
    const nextCursor = rows.length === limit ? this.encodeCursor(rows[rows.length - 1]!) : null;
    return { data: rows, nextCursor };
  }

  // -------------------- get --------------------

  async get(id: string, user: AuthUser) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            vendor: { select: { id: true, userId: true, businessName: true } },
            customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        evidence: { orderBy: { createdAt: 'asc' } },
        raisedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
    if (!dispute) throw new NotFoundException({ code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' });
    this.assertCanView(dispute, user);
    return dispute;
  }

  // -------------------- create --------------------

  async create(dto: CreateDisputeDto, user: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      select: { id: true, customerId: true, vendorId: true, orderNumber: true, status: true, deliveredAt: true },
    });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    if (order.customerId !== user.id) {
      throw new ForbiddenException({ code: 'NOT_ORDER_OWNER', message: 'You did not place this order' });
    }
    // Customers can only dispute orders that have actually shipped or been
    // delivered — no point disputing a pending order they can simply cancel.
    const disputable: OrderStatus[] = [OrderStatus.dispatched, OrderStatus.delivered];
    if (!disputable.includes(order.status)) {
      throw new BadRequestException({
        code: 'ORDER_NOT_DISPUTABLE',
        message: `Order in status ${order.status} cannot be disputed`,
      });
    }

    const severity = SEVERITY_BY_ISSUE[dto.issueType];
    const assignedToId = await this.pickSupportAgent();

    try {
      const dispute = await this.prisma.dispute.create({
        data: {
          orderId: order.id,
          raisedById: user.id,
          issueType: dto.issueType,
          severity,
          description: dto.description,
          status: DisputeStatus.open,
          assignedToId,
        },
      });

      await this.audit(user.id, 'dispute.created', dispute.id, { issueType: dto.issueType, severity });

      // Notify the assigned support agent so they pick it up promptly.
      if (assignedToId) {
        await this.notifications.enqueue('dispute_raised', {
          userId: assignedToId,
          disputeId: dispute.id,
          orderNumber: order.orderNumber,
          issueType: dto.issueType,
        });
      }
      return dispute;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ code: 'DISPUTE_EXISTS', message: 'A dispute already exists for this order' });
      }
      throw e;
    }
  }

  // -------------------- update (support/admin) --------------------

  async update(id: string, dto: UpdateDisputeDto, user: AuthUser) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!dispute) throw new NotFoundException({ code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' });

    if (dto.status) this.assertTransition(dispute.status, dto.status);

    const updated = await this.prisma.dispute.update({
      where: { id },
      data: {
        status: dto.status,
        severity: dto.severity,
        assignedToId: dto.assignedToId,
        resolutionNote: dto.resolutionNote,
      },
    });
    await this.audit(user.id, 'dispute.updated', id, { from: dispute.status, to: dto.status });
    return updated;
  }

  // -------------------- vendor response --------------------

  async vendorResponse(id: string, dto: VendorResponseDto, user: AuthUser) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: { order: { select: { vendorId: true, vendor: { select: { userId: true } } } } },
    });
    if (!dispute) throw new NotFoundException({ code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' });
    if (user.role !== UserRole.vendor || dispute.order.vendor.userId !== user.id) {
      throw new ForbiddenException({ code: 'NOT_VENDOR', message: 'Only the vendor on this order may respond' });
    }
    if (dispute.status === DisputeStatus.closed) {
      throw new BadRequestException({ code: 'DISPUTE_CLOSED', message: 'Cannot respond on a closed dispute' });
    }

    // Submitting a response auto-advances open → vendor_contacted (no-op if already past).
    const nextStatus = dispute.status === DisputeStatus.open ? DisputeStatus.vendor_contacted : dispute.status;

    const updated = await this.prisma.dispute.update({
      where: { id },
      data: {
        vendorResponse: dto.response,
        vendorRespondedAt: new Date(),
        status: nextStatus,
      },
    });
    await this.audit(user.id, 'dispute.vendor_responded', id, { length: dto.response.length });

    // Tell the customer who raised it.
    await this.notifications.enqueue('dispute_vendor_responded', {
      userId: dispute.raisedById,
      disputeId: id,
      vendorResponse: dto.response,
    });
    return updated;
  }

  // -------------------- escalate (support → admin) --------------------

  async escalate(id: string, user: AuthUser) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!dispute) throw new NotFoundException({ code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' });
    this.assertTransition(dispute.status, DisputeStatus.escalated);

    const updated = await this.prisma.dispute.update({
      where: { id },
      data: { status: DisputeStatus.escalated, severity: Severity.high },
    });
    await this.audit(user.id, 'dispute.escalated', id, {});
    return updated;
  }

  // -------------------- close (resolve + optional refund) --------------------

  async close(id: string, dto: CloseDisputeDto, user: AuthUser) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: { order: { select: { id: true, totalPence: true, customerId: true } } },
    });
    if (!dispute) throw new NotFoundException({ code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' });
    if (dispute.status === DisputeStatus.closed) {
      throw new BadRequestException({ code: 'ALREADY_CLOSED', message: 'Dispute already closed' });
    }

    if (REFUND_RESOLUTIONS.has(dto.resolution) && (!dto.refundAmountPence || dto.refundAmountPence < 1)) {
      throw new BadRequestException({
        code: 'REFUND_AMOUNT_REQUIRED',
        message: `resolution=${dto.resolution} requires refundAmountPence`,
      });
    }
    if (dto.resolution === ResolutionType.full_refund && dto.refundAmountPence !== dispute.order.totalPence) {
      throw new BadRequestException({
        code: 'FULL_REFUND_AMOUNT_MISMATCH',
        message: `full_refund must equal order total ${dispute.order.totalPence}p`,
      });
    }

    // Issue refund FIRST. If Stripe fails, we never mark the dispute resolved
    // — better to retry than to lie about the state of the customer's money.
    // Deterministic idempotency key: any retry of "close this dispute with
    // this resolution + amount" yields the same Stripe refund (no double-pay).
    if (REFUND_RESOLUTIONS.has(dto.resolution)) {
      const idempotencyKey = `dispute:${id}:refund:${dto.refundAmountPence}`;
      await this.payments.createRefund(
        { orderId: dispute.order.id, amountPence: dto.refundAmountPence!, reason: `Dispute ${id}: ${dto.resolution}` },
        { id: user.id, role: user.role },
        idempotencyKey,
      );
    }

    const closed = await this.prisma.dispute.update({
      where: { id },
      data: {
        status: DisputeStatus.closed,
        resolution: dto.resolution,
        resolutionNote: dto.resolutionNote,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
    });

    await this.audit(user.id, 'dispute.closed', id, { resolution: dto.resolution, refundAmountPence: dto.refundAmountPence });

    await this.notifications.enqueue('dispute_resolved', {
      userId: dispute.order.customerId,
      disputeId: id,
      resolution: dto.resolution,
      resolutionNote: dto.resolutionNote ?? '',
    });

    return closed;
  }

  // -------------------- evidence --------------------

  async listEvidence(id: string, user: AuthUser) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: { order: { select: { customerId: true, vendor: { select: { userId: true } } } } },
    });
    if (!dispute) throw new NotFoundException({ code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' });
    this.assertCanView(dispute, user);
    return this.prisma.disputeEvidence.findMany({ where: { disputeId: id }, orderBy: { createdAt: 'asc' } });
  }

  async uploadEvidence(
    id: string,
    file: { originalname: string; buffer: Buffer; mimetype: string; size: number },
    caption: string | undefined,
    user: AuthUser,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: { order: { select: { customerId: true, vendor: { select: { userId: true } } } } },
    });
    if (!dispute) throw new NotFoundException({ code: 'DISPUTE_NOT_FOUND', message: 'Dispute not found' });
    this.assertCanView(dispute, user);

    if (file.size > 10 * 1024 * 1024) {
      throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Max 10 MB per evidence file' });
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    const path = `disputes/${id}/${Date.now()}-${safeName}`;
    const storage = this.supabase.getClient().storage.from(SUPABASE_DOCS_BUCKET);

    const { error } = await storage.upload(path, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) {
      throw new BadRequestException({ code: 'UPLOAD_FAILED', message: error.message });
    }
    const { data } = storage.getPublicUrl(path);

    const type = file.mimetype.startsWith('image/') ? EvidenceType.photo : EvidenceType.document;
    const evidence = await this.prisma.disputeEvidence.create({
      data: {
        disputeId: id,
        type,
        fileUrl: data.publicUrl,
        caption: caption ?? null,
        uploadedBy: user.id,
      },
    });
    await this.audit(user.id, 'dispute.evidence_uploaded', id, { evidenceId: evidence.id, type });
    return evidence;
  }

  // -------------------- helpers --------------------

  private assertTransition(from: DisputeStatus, to: DisputeStatus): void {
    if (from === to) return;
    if (!STATUS_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `Cannot transition dispute from ${from} to ${to}`,
      });
    }
  }

  private assertCanView(
    dispute: { raisedById: string; order: { customerId?: string; vendor: { userId: string } } },
    user: AuthUser,
  ): void {
    const staffRoles: UserRole[] = [UserRole.admin, UserRole.support, UserRole.compliance, UserRole.finance];
    if (staffRoles.includes(user.role)) return;
    if (user.role === UserRole.customer && dispute.raisedById === user.id) return;
    if (user.role === UserRole.vendor && dispute.order.vendor.userId === user.id) return;
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'You may not view this dispute' });
  }

  /** Round-robin: support agent with the fewest currently-open disputes. */
  private async pickSupportAgent(): Promise<string | null> {
    const agents = await this.prisma.user.findMany({
      where: { role: UserRole.support, status: 'active' },
      select: { id: true },
    });
    if (!agents.length) return null;

    const counts = await this.prisma.dispute.groupBy({
      by: ['assignedToId'],
      where: { assignedToId: { in: agents.map((a) => a.id) }, status: { not: DisputeStatus.closed } },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.assignedToId, c._count._all]));
    return agents.sort((a, b) => (countMap.get(a.id) ?? 0) - (countMap.get(b.id) ?? 0))[0]!.id;
  }

  private async audit(actorId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
    await this.prisma.auditLog
      .create({ data: { actorId, action, entityType: 'dispute', entityId, metadata: metadata as Prisma.JsonObject } })
      .catch((e: Error) => this.logger.warn(`Audit log failed for ${action} ${entityId}: ${e.message}`));
  }

  private encodeCursor(row: { createdAt: Date; id: string }): string {
    return Buffer.from(JSON.stringify({ c: row.createdAt.toISOString(), id: row.id }), 'utf8').toString('base64url');
  }
  private decodeCursor(s: string): { createdAt: Date; id: string } | undefined {
    try {
      const obj = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as { c: string; id: string };
      return { createdAt: new Date(obj.c), id: obj.id };
    } catch {
      return undefined;
    }
  }
}
