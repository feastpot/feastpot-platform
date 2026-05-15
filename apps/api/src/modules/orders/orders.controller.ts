import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthedRequest, AuthUser } from '../../auth/types';

import { ProposeAmendmentDto, RespondAmendmentDto } from './dto/amendment.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { ReorderDto } from './dto/reorder.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

function requireUser(req: AuthedRequest): AuthUser {
  if (!req.user) throw new Error('No authenticated user');
  return req.user;
}

@ApiTags('Orders')
@ApiBearerAuth()
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @Roles(UserRole.customer, UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'List orders scoped by role (customer/vendor/admin)' })
  list(@Req() req: AuthedRequest, @Query() dto: ListOrdersDto) {
    return this.orders.list(requireUser(req), dto);
  }

  @Post()
  @Roles(UserRole.customer)
  @ApiOperation({ summary: 'Place a new order (customer)' })
  create(@Req() req: AuthedRequest, @Body() dto: CreateOrderDto) {
    return this.orders.createOrder(requireUser(req).id, dto);
  }

  @Get(':id')
  @Roles(UserRole.customer, UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Get order with items (customer/vendor/admin)' })
  get(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.orders.getById(id, requireUser(req));
  }

  @Post(':id/confirm')
  @Roles(UserRole.customer)
  @ApiOperation({ summary: 'Confirm order after Stripe client-side confirmation' })
  confirm(@Req() req: AuthedRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.orders.confirmOrder(id, requireUser(req).id);
  }

  @Patch(':id/status')
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Update order status (vendor/admin, gated by status machine)' })
  status(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orders.updateStatus(id, dto, requireUser(req));
  }

  @Post(':id/cancel')
  @Roles(UserRole.customer)
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Customer cancels their own order (UK Consumer Contracts Regulations 2013). ' +
      'Allowed only while status is pending or accepted.',
  })
  cancel(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.customerCancel(id, requireUser(req).id, dto.reason);
  }

  @Post(':id/reorder')
  @Roles(UserRole.customer)
  @ApiOperation({ summary: 'One-click reorder of a previous order' })
  reorder(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReorderDto,
  ) {
    return this.orders.reorder(id, requireUser(req).id, dto);
  }

  @Post(':id/amendment')
  @Roles(UserRole.vendor, UserRole.admin)
  @ApiOperation({ summary: 'Vendor proposes a change to an in-flight order' })
  requestAmendment(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ProposeAmendmentDto,
  ) {
    return this.orders.proposeAmendment(id, dto, requireUser(req));
  }

  @Patch(':id/amendment')
  @Roles(UserRole.customer)
  @ApiOperation({ summary: 'Customer accepts/declines pending amendment' })
  respondAmendment(
    @Req() req: AuthedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RespondAmendmentDto,
  ) {
    return this.orders.respondToAmendment(id, dto, requireUser(req));
  }
}
