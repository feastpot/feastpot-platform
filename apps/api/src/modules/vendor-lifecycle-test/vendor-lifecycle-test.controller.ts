import { Body, Controller, Headers, NotFoundException, Post, Req } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type Stripe from 'stripe';

import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthedRequest, AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from '../orders/dto/create-order.dto';
import { OrdersService } from '../orders/orders.service';
import { StripeWebhookProcessor } from '../payments/stripe-webhook.processor';
import { PayoutsService } from '../payouts/payouts.service';

type AccountUpdatedBody = {
  eventId: string;
  created: number;
  account: Stripe.Account;
};

@Controller({ path: 'test/vendor-lifecycle', version: '1' })
export class VendorLifecycleTestController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly payouts: PayoutsService,
    private readonly stripeWebhooks: StripeWebhookProcessor,
  ) {}

  @Post('account-updated')
  @Roles(UserRole.vendor)
  async accountUpdated(
    @Req() req: AuthedRequest,
    @Headers('x-test-factory-namespace') namespace: string | undefined,
    @Body() body: AccountUpdatedBody,
  ) {
    const user = this.requireFactoryUser(req.user, namespace);
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId: user.id },
      select: { id: true, stripeAccountId: true },
    });
    if (!vendor || (vendor.stripeAccountId && body.account.id !== vendor.stripeAccountId)) {
      throw new NotFoundException();
    }
    // Associating the external account is part of the simulated provider
    // callback. It is intentionally scoped to the authenticated vendor and is
    // not a general vendor mutation operation.
    if (!vendor.stripeAccountId) {
      await this.prisma.vendor.update({
        where: { id: vendor.id },
        data: { stripeAccountId: body.account.id },
      });
    }
    const payload = {
      id: body.eventId,
      type: 'account.updated',
      created: body.created,
      data: body.account,
      testAccount: body.account,
    };
    await this.prisma.processedWebhookEvent.upsert({
      where: { stripeEventId: body.eventId },
      create: {
        stripeEventId: body.eventId,
        eventType: 'account.updated',
        stripeCreatedAt: new Date(body.created * 1000),
        payload: payload as unknown as Prisma.InputJsonValue,
        status: 'claimed',
      },
      update: {},
    });
    const job = { data: payload } as never;
    await this.stripeWebhooks.onAccountUpdated(job);
    await this.stripeWebhooks.onCompleted(job);
    return this.prisma.vendor.findUniqueOrThrow({
      where: { id: vendor.id },
      select: {
        id: true,
        payoutsEnabled: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        stripeAccountUpdatedAt: true,
      },
    });
  }

  @Post('orders')
  @Roles(UserRole.customer)
  async createOrder(
    @Req() req: AuthedRequest,
    @Headers('x-test-factory-namespace') namespace: string | undefined,
    @Body() dto: CreateOrderDto,
  ) {
    const user = this.requireFactoryUser(req.user, namespace);
    const target = await this.prisma.vendor.findUnique({
      where: { id: dto.vendorId },
      select: { user: { select: { email: true } } },
    });
    if (!target || !this.hasNamespaceEmail(target.user.email, namespace!)) {
      throw new NotFoundException();
    }
    return this.orders.createAndConfirmTestOrder(user.id, dto);
  }

  @Post('weekly-batch')
  @Roles(UserRole.vendor)
  async weeklyBatch(
    @Req() req: AuthedRequest,
    @Headers('x-test-factory-namespace') namespace: string | undefined,
    @Body() body: { now?: string },
  ) {
    const user = this.requireFactoryUser(req.user, namespace);
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!vendor) throw new NotFoundException();
    const result = await this.payouts.runWeeklyBatch(body.now ? new Date(body.now) : new Date());
    const payout = await this.prisma.payout.findFirst({
      where: { vendorId: vendor.id },
      orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, vendorId: true, periodStart: true, periodEnd: true },
    });
    if (!payout) throw new NotFoundException();
    return { ...payout, batch: result };
  }

  private requireFactoryUser(user: AuthUser | null, namespace?: string): AuthUser {
    const configuredNamespace = process.env.TEST_FACTORY_NAMESPACE;
    if (
      process.env.NODE_ENV !== 'test' ||
      !configuredNamespace ||
      namespace !== configuredNamespace ||
      !/^[a-z0-9][a-z0-9-]{7,}$/i.test(namespace ?? '') ||
      !user ||
      !this.hasNamespaceEmail(user.email, namespace!)
    ) {
      throw new NotFoundException();
    }
    return user;
  }

  private hasNamespaceEmail(email: string, namespace: string): boolean {
    return email.toLowerCase().startsWith(`tf-${namespace.toLowerCase()}-`);
  }
}
