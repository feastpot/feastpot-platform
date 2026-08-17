import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';

import { Public } from '../../../auth/decorators/public.decorator';

import { ResendWebhookService } from './resend-webhook.service';

@ApiExcludeController()
@Controller({ path: 'webhooks', version: '1' })
export class ResendWebhookController {
  private readonly logger = new Logger(ResendWebhookController.name);

  constructor(private readonly service: ResendWebhookService) {}

  /**
   * POST /v1/webhooks/resend
   *
   * Receives Resend webhook events. Svix signature verification happens inside
   * the service. The controller returns 200 quickly; all DB writes are
   * fire-and-forget so the response is never delayed by slow storage.
   *
   * Resend retries on non-2xx responses, so it is important to return 200
   * even for events we do not act on (unknown types are persisted and ignored).
   */
  @Post('resend')
  @Public()
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId: string | undefined,
    @Headers('svix-timestamp') svixTimestamp: string | undefined,
    @Headers('svix-signature') svixSignature: string | undefined,
  ): Promise<{ received: true }> {
    const rawBody = req.rawBody;
    if (!rawBody) {
      this.logger.error(
        '[Resend Webhook] rawBody is undefined; check NestFactory.create options (rawBody: true)',
      );
      throw new BadRequestException({ code: 'MISSING_RAW_BODY' });
    }

    if (!svixId || !svixTimestamp || !svixSignature) {
      throw new BadRequestException({ code: 'MISSING_SVIX_HEADERS' });
    }

    // Verify the signature. Throws BadRequestException on failure.
    const payload = await this.service.verifyAndParse(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    });

    if (!payload) {
      // verifyAndParse returns null when RESEND_WEBHOOK_SECRET is not set;
      // that is an ops/config failure on our side, not a bad request.
      throw new ServiceUnavailableException({ code: 'WEBHOOK_NOT_CONFIGURED' });
    }

    // Process asynchronously so the 200 is returned immediately.
    // Errors are logged but never propagate to the HTTP response (Resend
    // would retry, which could cause duplicate side-effects).
    this.service.process(svixId, payload).catch((err: unknown) => {
      this.logger.error('[Resend Webhook] process() failed', err);
    });

    return { received: true };
  }
}
