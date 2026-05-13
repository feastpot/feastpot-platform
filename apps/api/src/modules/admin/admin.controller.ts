import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';

import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthedRequest } from '../../auth/types';
import { NotificationsService } from '../notifications/notifications.service';
import { TEMPLATES } from '../notifications/templates';

import { AdminService } from './admin.service';
import { ListAdminVendorsDto } from './dto/list-admin-vendors.dto';
import { ListAuditLogDto } from './dto/list-audit-log.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get('dashboard')
  @Roles(UserRole.admin, UserRole.finance, UserRole.support, UserRole.compliance)
  @ApiOperation({ summary: 'Admin dashboard metrics: GMV, orders, repeat rate, top vendors, daily revenue' })
  dashboard() {
    return this.admin.getDashboard();
  }

  @Get('vendors')
  // Support agents need vendor browsing for customer-contact lookups; finance
  // does not (they only care about payouts and reconciliation).
  @Roles(UserRole.admin, UserRole.compliance, UserRole.support)
  @ApiOperation({ summary: 'Vendor approval queue (filter by status, doc-status icon map per vendor)' })
  listVendors(@Query() dto: ListAdminVendorsDto) {
    return this.admin.listAdminVendors(dto);
  }

  @Get('audit-log')
  // Audit log is a compliance/admin tool: it includes status changes,
  // verifications, and other security-sensitive history. Support agents and
  // finance staff don't need raw access — they have their own scoped views.
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
    // Stream chunks straight to the wire so the client sees TTFB after the
    // header line, not after all 5 000 rows are formatted in memory.
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
    // The processor resolves the recipient via userId — default to the
    // calling admin so a self-test always lands in their inbox.
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
    };
    await this.notifications.enqueue(dto.event, sample, { jobId: `test:${dto.event}:${Date.now()}` });
    return { queued: true, event: dto.event, recipientUserId: userId };
  }

  @Post('payouts/:id/reconcile-stripe')
  @Roles(UserRole.admin, UserRole.finance)
  @ApiOperation({ summary: 'Reconcile a payout against the matching Stripe transfer' })
  reconcilePayout(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    // Role narrowing: requireUser is unnecessary here because @Roles already
    // rejects null users via the global SupabaseAuthGuard.
    return this.admin.reconcilePayoutWithStripe(id, req.user!.role);
  }
}
