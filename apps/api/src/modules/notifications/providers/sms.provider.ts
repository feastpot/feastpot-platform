import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import type { Twilio } from 'twilio';

export interface SmsMessage {
  to: string;
  body: string;
}

/**
 * Transactional SMS provider (Twilio).
 *
 * Background:
 *   Supabase Auth still owns OTP / verification SMS via its own Twilio
 *   integration - this provider does NOT touch those. Here we only send
 *   transactional notifications the registry routes to the `sms` channel
 *   (e.g. `order_confirmation`, `order_accepted`, `order_dispatched`).
 *
 * Graceful degradation:
 *   When TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER are
 *   missing - or when the recipient phone is empty - the provider logs
 *   a stub line and reports `delivered:false`. This matches the
 *   EmailProvider / WhatsappProvider patterns so the processor's per-channel
 *   accounting (sent vs skipped) stays consistent across providers.
 */
@Injectable()
export class SmsProvider {
  private readonly logger = new Logger(SmsProvider.name);
  private readonly client: Twilio | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const sid = config.get<string>('TWILIO_ACCOUNT_SID');
    const token = config.get<string>('TWILIO_AUTH_TOKEN');
    this.from = config.get<string>('TWILIO_FROM_NUMBER') ?? '';
    if (!sid || !token || !this.from) {
      this.logger.warn(
        'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER not all set - SMS sends will be logged only.',
      );
      this.client = null;
    } else {
      this.client = twilio(sid, token);
    }
  }

  async send(msg: SmsMessage): Promise<{ sid: string | null; delivered: boolean; reason?: string }> {
    if (!msg.to) {
      this.logger.debug('[skip-sms] recipient phone empty');
      return { sid: null, delivered: false, reason: 'no_recipient_phone' };
    }
    if (!this.client) {
      this.logger.log(`[stub-sms] to=${msg.to} body="${msg.body.slice(0, 60)}…"`);
      return { sid: null, delivered: false, reason: 'twilio_not_configured' };
    }
    const res = await this.client.messages.create({ from: this.from, to: msg.to, body: msg.body });
    return { sid: res.sid, delivered: true };
  }
}
