import {
  Body,
  Controller,
  Get,
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

import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthedRequest, AuthUser } from '../../auth/types';

import { HoldPayoutDto } from './dto/hold-payout.dto';
import { ListPayoutsDto } from './dto/list-payouts.dto';
import { PayoutsService } from './payouts.service';

function requireUser(req: AuthedRequest): AuthUser {
  if (!req.user) throw new Error('No authenticated user');
  return req.user;
}

@ApiTags('Payouts')
@ApiBearerAuth()
@Controller({ path: 'payouts', version: '1' })
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get()
  @Roles(UserRole.vendor, UserRole.finance, UserRole.admin)
  @ApiOperation({ summary: 'List payouts (scoped: vendors see their own, finance/admin see all)' })
  list(@Req() req: AuthedRequest, @Query() dto: ListPayoutsDto) {
    return this.payouts.list(requireUser(req), dto);
  }

  @Get('export.csv')
  @Roles(UserRole.vendor, UserRole.finance, UserRole.admin)
  @ApiOperation({
    summary: 'CSV export of the actor’s payout history (T006). Capped at 5 000 rows.',
  })
  async exportCsv(
    @Req() req: AuthedRequest,
    @Res() res: Response,
    @Query('vendorId') vendorId?: string,
  ) {
    // Headers set explicitly: when a route opts into manual @Res() handling,
    // Nest's @Header() decorators are not guaranteed to apply, so we own
    // both response headers and the body.
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="feastpot-payouts.csv"');
    res.flushHeaders?.();
    await this.payouts.exportCsv(requireUser(req), (chunk) => res.write(chunk), {
      vendorId,
    });
    res.end();
  }

  @Get(':id')
  @Roles(UserRole.vendor, UserRole.finance, UserRole.admin)
  @ApiOperation({ summary: 'Get a payout by id' })
  get(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.payouts.getById(id, requireUser(req));
  }

  @Post(':id/approve')
  @Roles(UserRole.finance, UserRole.admin)
  @ApiOperation({ summary: 'Approve a draft payout for transfer (finance/admin)' })
  approve(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.payouts.approvePayout(id, requireUser(req));
  }

  @Patch(':id/hold')
  @Roles(UserRole.finance, UserRole.admin)
  @ApiOperation({ summary: 'Place a hold on a payout (finance/admin)' })
  hold(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: HoldPayoutDto,
  ) {
    return this.payouts.holdPayout(id, dto.holdReason, requireUser(req));
  }
}
