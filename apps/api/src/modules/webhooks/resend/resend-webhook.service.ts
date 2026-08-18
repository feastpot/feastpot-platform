import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Webhook } from 'svix';

import { PrismaService } from '../../../prisma/prisma.service';

/** Resend event types we explicitly handle. Others are persisted but ignored. */
const HANDLED_EVENT_TYPES = new Set([
  'email.sent',
  'email.delivered',
  'email.delivery_delayed',
  'email.bounced',
  'email.complained',
  'email.failed',
  'email.suppressed',
]);

interface ResendEventData {
  email_id?: string;
  created_at?: string;
  from?: string;
  to?: string[];
  subject?: string;
  bounce?: {
    type?: string; // "hard" | "soft" | "bounce"
  };
}

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: ResendEventData;
}

@Injectable()
export class ResendWebhookService {
  private readonly logger = new Logger(ResendWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Verify the Svix signature and parse the payload.
   *
   * Returns null when RESEND_WEBHOOK_SECRET is not set (ops misconfiguration).
   * Throws BadRequestException when the signature is invalid.
   */
  async verifyAndParse(
    rawBody: Buffer,
    headers: {
      'svix-id': string;
      'svix-timestamp': string;
      'svix-signature': string;
    },
  ): Promise<ResendWebhookPayload | null> {
    const secret = this.config.get<string>('RESEND_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('[Resend Webhook] RESEND_WEBHOOK_SECRET is not configured');
      return null;
    }

    try {
      const wh = new Webhook(secret);
      // wh.verify() returns the parsed payload on success, throws on failure.
      const payload = wh.verify(rawBody.toString('utf8'), headers) as ResendWebhookPayload;
      return payload;
    } catch {
      throw new BadRequestException({ code: 'INVALID_SVIX_SIGNATURE' });
    }
  }

  /**
   * Persist the event and apply any side-effects (bounce suppression, etc.).
   *
   * Idempotent: if a row with the given svix_id already exists, we return
   * early without error (Resend's at-least-once delivery can re-deliver).
   */
  async process(svixId: string, payload: ResendWebhookPayload): Promise<void> {
    const { type, data } = payload;

    const emailId = data.email_id ?? '';
    // Normalise address: lowercase + trim so a suppression for User@X.com
    // is matched when we later look up user@x.com (and vice-versa).
    const to = ((data.to ?? [])[0] ?? '').toLowerCase().trim();
    const subject = data.subject ?? null;

    if (!HANDLED_EVENT_TYPES.has(type)) {
      this.logger.warn(`[Resend Webhook] unhandled event type: ${type}`);
    }

    // Determine whether this event triggers suppression.
    let bounceType: string | null = null;
    let suppressed = false;

    if (type === 'email.bounced') {
      const raw = data.bounce?.type ?? '';
      bounceType = raw === 'hard' || raw === 'soft' ? raw : 'hard';
      // Hard bounces suppress the address immediately; soft bounces are logged
      // but not suppressed (transient delivery failure).
      suppressed = bounceType === 'hard';
    }

    if (type === 'email.complained') {
      // Spam complaints: suppress the recipient immediately.
      suppressed = true;
    }

    try {
      await this.prisma.emailEvent.upsert({
        where: { svixId },
        create: {
          svixId,
          eventType: type,
          emailId,
          to,
          subject,
          bounceType,
          suppressed,
          rawPayload: payload as object,
        },
        // If the row already exists, do nothing (idempotency).
        update: {},
      });
    } catch (err: unknown) {
      // Unique constraint violation means duplicate delivery; treat as success.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Unique constraint')) {
        this.logger.debug(`[Resend Webhook] duplicate svix-id ${svixId}: skipping`);
        return;
      }
      throw err;
    }

    if (suppressed) {
      this.logger.warn(
        `[Resend Webhook] suppressing ${to}: event=${type}, bounceType=${bounceType ?? 'n/a'}`,
      );
    }

    this.logger.log(`[Resend Webhook] processed ${type} for ${emailId} → ${to}`);
  }
}
