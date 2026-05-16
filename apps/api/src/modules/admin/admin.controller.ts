import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import type { Queue } from 'bull';

import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthedRequest } from '../../auth/types';
import { NotificationsService } from '../notifications/notifications.service';
import { PushProvider } from '../notifications/providers/push.provider';
import { TEMPLATES } from '../notifications/templates';
import { PAYOUTS_QUEUE, WEEKLY_BATCH_JOB } from '../payouts/processors/payout-batch.processor';

import { PrismaService } from '../../prisma/prisma.service';

import { AdminService } from './admin.service';
import { AdminUsersService } from './admin-users.service';
import {
  IssueCreditDto,
  ListAdminOrdersDto,
  OverrideOrderStatusDto,
  ReinstateUserDto,
  SuspendUserDto,
} from './dto/admin-user-actions.dto';
import { BroadcastAudience, BroadcastPushDto } from './dto/broadcast-push.dto';
import { ListAdminVendorsDto } from './dto/list-admin-vendors.dto';
import { ListAuditLogDto } from './dto/list-audit-log.dto';
import { UpdateVendorApplicationDto } from './dto/update-vendor-application.dto';

interface SearchAnalyticsRow {
  query: string;
  search_count: bigint;
  avg_results: number;
  zero_result_count: bigint;
  last_searched: Date;
}

interface SearchAnalyticsResponse {
  query: string;
  searchCount: number;
  avgResults: number;
  zeroResultCount: number;
  lastSearched: string;
}

@ApiTags('Admin')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly admin: AdminService,
    private readonly adminUsers: AdminUsersService,
    private readonly notifications: NotificationsService,
    private readonly push: PushProvider,
    private readonly prisma: PrismaService,
    // PAYOUTS_QUEUE is registered globally in app.module.ts (BullModule.registerQueue),
    // same instance the cron in PayoutBatchProcessor enqueues against. Injecting
    // it here lets admins fire the same job out-of-cycle without duplicating
    // the runWeeklyBatch logic.
    @InjectQueue(PAYOUTS_QUEUE) private readonly payoutBatchQueue: Queue,
  ) {}

  /**
   * FR-SRCH-001: top customer searches over the last 30 days.
   *
   * Returned `avgResults` drives a green/amber/red colour-coded bar in the
   * dashboard widget, and `zeroResultCount` powers the
   * "recruitment opportunity" callout (terms customers searched for but
   * couldn't find any vendors).
   */
  @Get('search-analytics')
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'Top customer searches over the last 30 days (count, avg results, zero-result count)' })
  async searchAnalytics(): Promise<SearchAnalyticsResponse[]> {
    const rows = await this.prisma.$queryRaw<SearchAnalyticsRow[]>`
      SELECT
        query,
        COUNT(*)                                      AS search_count,
        ROUND(AVG(results_count))::int               AS avg_results,
        COUNT(*) FILTER (WHERE results_count = 0)    AS zero_result_count,
        MAX(searched_at)                              AS last_searched
      FROM search_logs
      WHERE searched_at > NOW() - INTERVAL '30 days'
      GROUP BY query
      ORDER BY search_count DESC
      LIMIT 25
    `;
    return rows.map((r) => ({
      query: r.query,
      searchCount: Number(r.search_count),
      avgResults: r.avg_results,
      zeroResultCount: Number(r.zero_result_count),
      lastSearched: r.last_searched.toISOString(),
    }));
  }

  @Get('dashboard')
  @Roles(UserRole.admin, UserRole.finance, UserRole.support, UserRole.compliance)
  @ApiOperation({ summary: 'Admin dashboard metrics: GMV, orders, repeat rate, top vendors, daily revenue' })
  dashboard() {
    return this.admin.getDashboard();
  }

  @Get('vendors')
  @Roles(UserRole.admin, UserRole.compliance, UserRole.support)
  @ApiOperation({ summary: 'Vendor approval queue (filter by status, doc-status icon map per vendor)' })
  listVendors(@Query() dto: ListAdminVendorsDto) {
    return this.admin.listAdminVendors(dto);
  }

  @Get('vendor-applications')
  @Roles(UserRole.admin, UserRole.compliance, UserRole.support)
  @ApiOperation({
    summary: 'Pre-account vendor application leads (default: status=pending, newest first)',
  })
  listVendorApplications(@Query('status') status?: 'pending' | 'approved' | 'rejected') {
    return this.admin.listVendorApplications(status);
  }

  @Get('vendor-applications/:id')
  @Roles(UserRole.admin, UserRole.compliance, UserRole.support)
  @ApiOperation({ summary: 'Single vendor application detail' })
  getVendorApplication(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.admin.getVendorApplication(id);
  }

  @Patch('vendor-applications/:id')
  @Roles(UserRole.admin, UserRole.compliance)
  @ApiOperation({ summary: 'Approve or reject a vendor application' })
  updateVendorApplication(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthedRequest,
    @Body() dto: UpdateVendorApplicationDto,
  ) {
    return this.admin.updateVendorApplication(id, req.user!.id, dto);
  }

  @Get('audit-log')
  @Roles(UserRole.admin, UserRole.compliance)
  @ApiOperation({ summary: 'List audit-log rows with filters' })
  listAuditLog(@Query() dto: ListAuditLogDto) {
    return this.admin.listAuditLog(dto);
  }

  @Get('audit-log.csv')
  @Roles(UserRole.admin, UserRole.compliance)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit-log.csv"')
  @ApiOperation({ summary: 'CSV export of audit-log rows (capped at 5 000)' })
  async exportAuditLogCsv(@Query() dto: ListAuditLogDto, @Res() res: Response) {
    res.flushHeaders?.();
    await this.admin.exportAuditLogCsv(dto, (chunk) => {
      res.write(chunk);
    });
    res.end();
  }

  @Get('compliance/expiring')
  @Roles(UserRole.admin, UserRole.compliance)
  @ApiOperation({ summary: 'Expiring or expired vendor documents, sorted by daysRemaining ASC' })
  listExpiring() {
    return this.admin.listExpiringDocuments();
  }

  // ============================================================
  // FR-ADM-002 — User power tools
  // ============================================================

  @Get('users/search')
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'Look up a user by email — returns profile, balance, last 10 orders' })
  searchUser(@Query('email') email: string) {
    return this.adminUsers.findByEmail(email);
  }

  @Post('users/:userId/credit')
  @Roles(UserRole.admin, UserRole.finance)
  @ApiOperation({ summary: 'Issue goodwill credit (1p = 1 loyalty point)' })
  async issueCredit(
    @Req() req: AuthedRequest,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: IssueCreditDto,
  ) {
    await this.adminUsers.issueCredit(userId, dto.amountPence, dto.reason, req.user!.id);
    return { success: true };
  }

  @Post('users/:userId/suspend')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Suspend user account (DB status flip + global Supabase sign-out)' })
  async suspendUser(
    @Req() req: AuthedRequest,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: SuspendUserDto,
  ) {
    await this.adminUsers.suspendUser(userId, dto.reason, req.user!.id);
    return { success: true };
  }

  @Post('users/:userId/reinstate')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Reinstate a suspended user (reason persisted to AuditLog.metadata)' })
  async reinstateUser(
    @Req() req: AuthedRequest,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: ReinstateUserDto,
  ) {
    await this.adminUsers.reinstateUser(userId, dto.reason, req.user!.id);
    return { success: true };
  }

  // ============================================================
  // FR-PUSH-001 — Operator broadcast composer
  // ============================================================

  @Post('push/broadcast')
  @Roles(UserRole.admin)
  @ApiOperation({
    summary:
      'Broadcast a web-push notification to an audience (all / by_city / by_cuisine). Audited.',
  })
  async broadcastPush(@Req() req: AuthedRequest, @Body() dto: BroadcastPushDto) {
    const filter =
      dto.audience === BroadcastAudience.all
        ? ({ audience: 'all' } as const)
        : dto.audience === BroadcastAudience.by_city
          ? ({ audience: 'by_city', city: dto.city! } as const)
          : ({ audience: 'by_cuisine', cuisine: dto.cuisine! } as const);

    const result = await this.push.broadcast(filter, {
      title: dto.title,
      body: dto.body,
      url: dto.url,
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: req.user!.id,
        entityType: 'push_broadcast',
        entityId: req.user!.id,
        action: 'push.broadcast',
        metadata: {
          audience: dto.audience,
          city: dto.city ?? null,
          cuisine: dto.cuisine ?? null,
          title: dto.title,
          body: dto.body,
          url: dto.url ?? null,
          recipients: result.recipients,
          delivered: result.delivered,
          failed: result.failed,
        },
      },
    });

    return result;
  }

  @Patch('orders/:orderId/status')
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'Override order status — emergency repair only, audited' })
  overrideOrderStatus(
    @Req() req: AuthedRequest,
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body() dto: OverrideOrderStatusDto,
  ) {
    return this.adminUsers.overrideOrderStatus(orderId, dto.status, dto.reason, req.user!.id);
  }

  @Get('users/:userId/export')
  @Roles(UserRole.admin, UserRole.compliance)
  @ApiOperation({ summary: 'GDPR / DSAR export of all data for a user (JSON download)' })
  async exportUser(
    @Req() req: AuthedRequest,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Res() res: Response,
  ) {
    const data = await this.adminUsers.exportUserData(userId, req.user!.id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="feastpot-user-${userId}.json"`);
    res.send(JSON.stringify(data, null, 2));
  }

  // ============================================================
  // FR-ADM-002 — Order browser
  // ============================================================

  @Get('orders')
  @Roles(UserRole.admin, UserRole.support, UserRole.finance)
  @ApiOperation({
    summary:
      'Admin order browser: filter by status / date range / search. Pass withPiStatus=1 to enrich first 50 rows with live Stripe PaymentIntent status.',
  })
  listOrders(@Query() dto: ListAdminOrdersDto) {
    return this.admin.listAdminOrders({
      status: dto.status,
      q: dto.q,
      range: dto.range,
      withPiStatus: dto.withPiStatus === '1' || dto.withPiStatus === 'true',
      limit: dto.limit,
    });
  }

  // ============================================================
  // Existing endpoints
  // ============================================================

  @Post('test-notification')
  @Roles(UserRole.admin)
  @ApiOperation({
    summary:
      'DEV ONLY: enqueue a sample notification for any registered event template. Disabled in production.',
  })
  async testNotification(
    @Req() req: AuthedRequest,
    @Body() dto: { event: string; userId?: string; overrideEmail?: string; overridePhone?: string },
  ) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException({ code: 'NOT_AVAILABLE_IN_PROD', message: 'Test endpoint disabled in production' });
    }
    if (!dto?.event || !TEMPLATES[dto.event]) {
      throw new BadRequestException({
        code: 'UNKNOWN_TEMPLATE',
        message: `Unknown event template "${dto?.event}". Known: ${Object.keys(TEMPLATES).join(', ')}`,
      });
    }
    const userId = dto.userId ?? req.user!.id;
    const sample = {
      userId,
      orderId: 'test-order-id',
      orderNumber: 'FP-TEST-001',
      vendorName: "Maman's Kitchen",
      vendorId: 'test-vendor-id',
      customerName: 'Test Customer',
      items: [{ name: 'Egusi Soup', qty: 1, pricePence: 3500 }],
      totalPence: 4000,
      amountPence: 4000,
      grossPence: 5000,
      commissionPence: 600,
      netPence: 4400,
      scheduledFor: 'Saturday 14:00–15:00',
      payoutDate: 'Monday',
      etaText: '14:45',
      loyaltyPointsEarned: 40,
      eventType: 'wedding',
      guestCount: 50,
      eventDate: '2026-06-01',
      postcode: 'SE1 7TY',
      balancePence: 25000,
      deductionPence: 1500,
      holdReason: 'KYC review pending',
      issueType: 'late_delivery',
      disputeId: 'test-dispute-id',
      vendorResponse: 'Apologies — driver was held up in traffic.',
      resolution: 'partial_refund',
      resolutionNote: 'Issued £10 goodwill credit.',
      documentType: 'Public liability insurance',
      expiresAt: '2026-06-10',
      daysUntilExpiry: 14,
      reason: 'Goodwill — late delivery',
    };
    await this.notifications.enqueue(dto.event, sample, { jobId: `test:${dto.event}:${Date.now()}` });
    return { queued: true, event: dto.event, recipientUserId: userId };
  }

  @Post('payouts/:id/reconcile-stripe')
  @Roles(UserRole.admin, UserRole.finance)
  @ApiOperation({ summary: 'Reconcile a payout against the matching Stripe transfer' })
  reconcilePayout(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.admin.reconcilePayoutWithStripe(id, req.user!.role);
  }

  /**
   * D13 (S4): Manual out-of-cycle payout trigger. The cron at
   * `0 2 * * 1` is the canonical scheduler; this endpoint enqueues the
   * SAME job the cron does so business logic stays single-sourced in
   * `PayoutsService.runWeeklyBatch`. Idempotency inside the batch
   * (`skippedVendorIds` for vendors whose period is already paid out)
   * means admin can safely click this even if the cron just ran — no
   * duplicate transfers.
   *
   * Returns 202 Accepted (not 200) because the response is sent before
   * the batch actually runs; the caller monitors progress via Bull
   * Board (`/admin/queues`).
   */
  @Post('payouts/run-batch')
  @Roles(UserRole.admin, UserRole.finance)
  @HttpCode(202)
  @ApiOperation({ summary: 'Manually enqueue the weekly payout batch (out-of-cycle run)' })
  async runPayoutBatch(@Req() req: AuthedRequest) {
    const adminUserId = req.user!.id;
    this.logger.log(`[Admin] Manual payout batch triggered by ${adminUserId}`);

    // Audit BEFORE enqueue so the trail exists even if Redis is down and the
    // queue.add() below throws — we still want a record that an admin tried.
    await this.prisma.auditLog.create({
      data: {
        actorId: adminUserId,
        entityType: 'system',
        // entityId is UUID-typed in the schema; null is the only safe value
        // for a non-row-scoped action like a global batch trigger.
        entityId: null,
        action: 'admin.payout_batch_manually_triggered',
        metadata: {
          target: 'payout-batch',
          triggeredAt: new Date().toISOString(),
        },
      },
    });

    // Unique jobId per click prevents BullMQ deduplication against the cron's
    // repeating job (jobId: 'weekly-payout'). Without this, a manual click
    // shortly after the cron tick would silently no-op.
    const jobId = `manual-payout-${Date.now()}`;
    await this.payoutBatchQueue.add(
      WEEKLY_BATCH_JOB,
      { triggeredBy: 'admin', adminUserId },
      { jobId },
    );

    return {
      message: 'Payout batch job enqueued. Check Job queues to monitor progress.',
      queue: PAYOUTS_QUEUE,
      jobId,
    };
  }
}
