import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthedRequest, AuthUser } from '../../auth/types';

import { CreateRefundDto } from './dto/create-refund.dto';
import { ListPaymentsDto } from './dto/list-payments.dto';
import { PaymentsService } from './payments.service';

function requireUser(req: AuthedRequest): AuthUser {
  if (!req.user) throw new Error('No authenticated user');
  return req.user;
}

@ApiTags('Payments')
@ApiBearerAuth()
@Controller({ path: 'payments', version: '1' })
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Roles(UserRole.finance, UserRole.admin)
  @ApiOperation({ summary: 'List payment events (finance/admin only)' })
  list(@Query() dto: ListPaymentsDto) {
    return this.payments.list(dto);
  }

  @Post('refunds')
  @Roles(UserRole.support, UserRole.finance, UserRole.admin)
  @ApiOperation({ summary: 'Initiate refund (support/finance/admin); large refunds restricted to finance/admin)' })
  refund(@Req() req: AuthedRequest, @Body() dto: CreateRefundDto) {
    const u = requireUser(req);
    return this.payments.createRefund(dto, { id: u.id, role: u.role });
  }
}
