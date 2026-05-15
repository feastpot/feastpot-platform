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
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import type { Request } from 'express';
import type { Queue } from 'bull';
import type Stripe from 'stripe';

import { Public } from '../../auth/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';

export const STRIPE_WEBHOOK_QUEUE = 'stripe-webhooks';

@ApiExcludeController()
@Controller({ path: 'webhooks', version: '1' })
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(STRIPE_WEBHOOK_QUEUE) private readonly queue: Queue,
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
    // webhook would 400 silently and orders would never confirm — log loudly.
    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error('[Stripe Webhook] rawBody is undefined — check NestFactory.create options');
      throw new BadRequestException({ code: 'MISSING_RAW_BODY', message: 'Webhook payload missing' });
    }

    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET not configured — rejecting webhook');
      throw new BadRequestException({ code: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook not configured' });
    }
    if (!signature) {
      throw new BadRequestException({ code: 'MISSING_SIGNATURE', message: 'Missing stripe-signature header' });
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.constructEvent(rawBody, signature, secret);
    } catch (e) {
      this.logger.warn(`Stripe signature verification failed: ${(e as Error).message}`);
      throw new BadRequestException({ code: 'INVALID_SIGNATURE', message: 'Stripe signature invalid' });
    }

    // Idempotency: stripeEventId has a unique constraint. Check first to short-
    // circuit retries, but we ENQUEUE BEFORE we mark processed — otherwise an
    // enqueue failure would be permanently swallowed by the next retry.
    const already = await this.prisma.processedWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
      select: { id: true },
    });
    if (already) {
      this.logger.debug(`Duplicate webhook ${event.id} (${event.type}) — already processed`);
      return { received: true };
    }

    // Enqueue first; if Redis is down this throws and Stripe will retry.
    await this.queue.add(event.type, { id: event.id, type: event.type, data: event.data.object }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });

    // Now mark processed. If THIS fails (rare), Stripe retries → we'll try to
    // enqueue again. The processor handler must remain idempotent (which it is:
    // updateMany on natural keys, no double-charges).
    try {
      await this.prisma.processedWebhookEvent.create({
        data: { stripeEventId: event.id, eventType: event.type },
      });
    } catch (e) {
      // Race with a parallel delivery: another request already inserted. Safe.
      this.logger.debug(`Race on processed-event insert for ${event.id}; assumed already recorded`);
    }

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
