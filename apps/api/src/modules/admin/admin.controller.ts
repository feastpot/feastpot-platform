import {
  Controller,
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

import { AdminService } from './admin.service';
import { ListAdminVendorsDto } from './dto/list-admin-vendors.dto';
import { ListAuditLogDto } from './dto/list-audit-log.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@Controller({ path: 'admin', version: '1' })
export class AdminController {
  constructor(private readonly admin: AdminService) {}

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
    const csv = await this.admin.exportAuditLogCsv(dto);
    res.send(csv);
  }

  @Get('compliance/expiring')
  @Roles(UserRole.admin, UserRole.compliance)
  @ApiOperation({ summary: 'Expiring or expired vendor documents, sorted by daysRemaining ASC' })
  listExpiring() {
    return this.admin.listExpiringDocuments();
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
