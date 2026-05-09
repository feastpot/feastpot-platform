import { Injectable, Logger } from '@nestjs/common';

export interface SmsMessage {
  to: string;
  body: string;
}

/**
 * SMS is intentionally a stub.
 *
 * Supabase Auth handles OTP / verification SMS for us via its own Twilio
 * integration. We do not send any other transactional SMS — email / WhatsApp /
 * push cover those channels. This class exists so the processor's channel
 * dispatch table is exhaustive (no `default:` case that silently drops jobs).
 */
@Injectable()
export class SmsProvider {
  private readonly logger = new Logger(SmsProvider.name);

  send(msg: SmsMessage): { delivered: false; reason: string } {
    this.logger.debug(`[noop-sms] to=${msg.to} body="${msg.body.slice(0, 60)}…" — Supabase Auth owns OTP SMS.`);
    return { delivered: false, reason: 'sms_handled_by_supabase_auth' };
  }
}
