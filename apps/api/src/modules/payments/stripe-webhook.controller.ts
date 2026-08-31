import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
import type { Request } from 'express';
import type Stripe from 'stripe';

import { Public } from '../../auth/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';

import { StripeWebhookDeliveryService } from './stripe-webhook-delivery.service';
import { HANDLED_STRIPE_EVENT_TYPES } from './stripe-webhook.events';

export const STRIPE_WEBHOOK_QUEUE = 'stripe-webhooks';

@ApiExcludeController()
@Controller({ path: 'webhooks', version: '1' })
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  /** Sentry dedupe: alert once per unhandled event type per process. */
  private readonly alertedUnhandledTypes = new Set<string>();

  constructor(
    private readonly stripe: StripeService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly delivery: StripeWebhookDeliveryService,
  ) {}

  @Post('stripe')
  @Public()
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    // Hard guard: if rawBody is undefined, NestFactory.create is misconfigured
    // (rawBody:true / bodyParser:false / express.json verify hook). Every
    // webhook would 400 silently and orders would never confirm - log loudly.
    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error('[Stripe Webhook] rawBody is undefined - check NestFactory.create options');
      throw new BadRequestException({
        code: 'MISSING_RAW_BODY',
        message: 'Webhook payload missing',
      });
    }

    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      // D21: 503 (not 400) - this is an ops/config failure on our side, not
      // a malformed request from Stripe. A 503 also makes Stripe retry with
      // backoff so events aren't lost once the secret is set.
      this.logger.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured');
      throw new ServiceUnavailableException({
        code: 'WEBHOOK_NOT_CONFIGURED',
        message: 'Webhook processing not available - contact ops',
      });
    }
    if (!signature) {
      throw new BadRequestException({
        code: 'MISSING_SIGNATURE',
        message: 'Missing stripe-signature header',
      });
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(rawBody, signature, secret);
    } catch (e) {
      this.logger.warn(`Stripe signature verification failed: ${(e as Error).message}`);
      throw new BadRequestException({
        code: 'INVALID_SIGNATURE',
        message: 'Stripe signature invalid',
      });
    }

    let claim: { id: string };
    try {
      claim = await this.prisma.processedWebhookEvent.create({
        data: {
          stripeEventId: event.id,
          eventType: event.type,
          stripeCreatedAt: new Date(event.created * 1000),
          payload: {
            id: event.id,
            type: event.type,
            created: event.created,
            data: event.data.object,
          } as unknown as Prisma.InputJsonValue,
          status: HANDLED_STRIPE_EVENT_TYPES.has(event.type) ? 'claimed' : 'ignored',
          processedAt: HANDLED_STRIPE_EVENT_TYPES.has(event.type) ? null : new Date(),
        },
        select: { id: true },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.debug(`Duplicate webhook ${event.id} (${event.type}) - already accepted`);
        return { received: true };
      }
      throw error;
    }

    // Unhandled event types: the processor only has named handlers (legacy
    // Bull forbids a catch-all alongside them), so enqueueing anything else
    // would silently rot in the queue. Record the event for audit, alert
    // once per type per process, and ack so Stripe doesn't retry forever.
    if (!HANDLED_STRIPE_EVENT_TYPES.has(event.type)) {
      this.logger.warn(
        `[Stripe Webhook] Unhandled event type ${event.type} (${event.id}) - recorded but NOT processed`,
      );
      if (!this.alertedUnhandledTypes.has(event.type)) {
        this.alertedUnhandledTypes.add(event.type);
        Sentry.captureMessage(
          `Stripe sent unhandled webhook event type: ${event.type} - events of this type are being ignored`,
          'warning',
        );
      }
      return { received: true };
    }

    await this.delivery.deliver(claim.id);

    return { received: true };
  }

  // Dev-only smoke test: verifies the express.json verify hook is wired up
  // and Nest is forwarding req.rawBody. Returns 403 in production so it
  // can never be probed on a live deployment.
  //   curl -X POST http://localhost:3001/v1/webhooks/stripe-test \
  //     -H "Content-Type: application/json" -d '{}'
  //   → { rawBodyPresent: true, rawBodyLength: 2 }
  @Post('stripe-test')
  @Public()
  async webhookSmokeTest(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ rawBodyPresent: boolean; rawBodyLength: number }> {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException();
    }
    return {
      rawBodyPresent: !!req.rawBody,
      rawBodyLength: req.rawBody?.length ?? 0,
    };
  }
}
