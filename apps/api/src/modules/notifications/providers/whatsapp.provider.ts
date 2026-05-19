import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import type { Twilio } from 'twilio';

export interface WhatsappMessage {
  to: string; // E.164 phone number (provider will add `whatsapp:` for Twilio)
  template: string; // internal template name (matches keys in templates/index.ts)
  params: Array<string | number>; // positional template parameters
}

/**
 * WhatsApp transactional provider with two backends:
 *
 *   1. **Twilio** (preferred when TWILIO_WHATSAPP_FROM is set). Production
 *      sends use Twilio Content Templates - each internal template name
 *      maps to a Twilio Content SID via env var
 *      `TWILIO_CONTENT_SID_<template>` (e.g. TWILIO_CONTENT_SID_order_confirmation).
 *      Positional `params` become `contentVariables` as { "1": p1, "2": p2 }.
 *
 *      Used when the operator's Meta business account can't be opened
 *      directly (e.g. personal FB account disabled) - Twilio acts as the
 *      Meta BSP and handles WABA registration on the operator's behalf.
 *
 *   2. **Meta Cloud API** (fallback when Twilio creds absent and
 *      WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID are set). Sends
 *      pre-approved templates by name. Cheaper per-message than Twilio
 *      but requires a Meta Business Account.
 *
 *   3. **Stub** (neither configured). Logs and reports `delivered:false`
 *      so the processor's per-channel accounting stays consistent.
 *
 * Sandbox: when TWILIO_WHATSAPP_FROM is the shared sandbox number
 * (whatsapp:+14155238886), no Content SIDs are required for one-off
 * scripted tests (see scripts/send-test-whatsapp.ts which talks to
 * Twilio directly with a free-text body). The processor flow still
 * requires Content SID mappings - free-text body is not viable for
 * outbound business-initiated messages outside the 24h CS window.
 */
@Injectable()
export class WhatsappProvider {
  private readonly logger = new Logger(WhatsappProvider.name);
  private readonly mode: 'twilio' | 'meta' | 'stub';

  // Twilio
  private readonly twilioClient: Twilio | null = null;
  private readonly twilioFrom: string = '';

  // Meta
  private readonly metaToken: string | undefined;
  private readonly metaPhoneNumberId: string | undefined;
  private readonly metaBaseUrl = 'https://graph.facebook.com/v18.0';

  constructor(private readonly config: ConfigService) {
    const twilioFromRaw = config.get<string>('TWILIO_WHATSAPP_FROM');
    const twilioSid = config.get<string>('TWILIO_ACCOUNT_SID');
    const twilioToken = config.get<string>('TWILIO_AUTH_TOKEN');

    if (twilioFromRaw && twilioSid && twilioToken) {
      this.twilioFrom = twilioFromRaw.startsWith('whatsapp:')
        ? twilioFromRaw
        : `whatsapp:${twilioFromRaw}`;
      this.twilioClient = twilio(twilioSid, twilioToken);
      this.mode = 'twilio';
      this.logger.log(`WhatsApp provider: Twilio (from=${this.twilioFrom})`);
      return;
    }

    this.metaToken = config.get<string>('WHATSAPP_ACCESS_TOKEN');
    this.metaPhoneNumberId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (this.metaToken && this.metaPhoneNumberId) {
      this.mode = 'meta';
      this.logger.log('WhatsApp provider: Meta Cloud API');
      return;
    }

    this.mode = 'stub';
    this.logger.warn(
      'WhatsApp provider: no credentials (set TWILIO_WHATSAPP_FROM + TWILIO_ACCOUNT_SID/AUTH_TOKEN, or WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID). Sends will be logged only.',
    );
  }

  async send(msg: WhatsappMessage): Promise<{ id: string | null; delivered: boolean }> {
    if (!msg.to) {
      this.logger.debug(`[skip-wa] empty recipient for template=${msg.template}`);
      return { id: null, delivered: false };
    }

    if (this.mode === 'stub') {
      this.logger.log(`[stub-wa] to=${msg.to} template=${msg.template}`);
      return { id: null, delivered: false };
    }

    if (this.mode === 'twilio') {
      return this.sendTwilio(msg);
    }

    return this.sendMeta(msg);
  }

  private async sendTwilio(msg: WhatsappMessage): Promise<{ id: string | null; delivered: boolean }> {
    if (!this.twilioClient) {
      // Defensive - mode==='twilio' guarantees this is set
      return { id: null, delivered: false };
    }

    const contentSid = this.config.get<string>(`TWILIO_CONTENT_SID_${msg.template}`);
    const toAddr = msg.to.startsWith('whatsapp:') ? msg.to : `whatsapp:${msg.to}`;

    if (!contentSid) {
      this.logger.warn(
        `[twilio-wa] no TWILIO_CONTENT_SID_${msg.template} mapped - skipping. ` +
          `Create the template in Twilio Content Builder and add the SID as TWILIO_CONTENT_SID_${msg.template}.`,
      );
      return { id: null, delivered: false };
    }

    const contentVariables = msg.params.length
      ? JSON.stringify(
          Object.fromEntries(msg.params.map((v, i) => [String(i + 1), String(v)])),
        )
      : undefined;

    const res = await this.twilioClient.messages.create({
      from: this.twilioFrom,
      to: toAddr,
      contentSid,
      ...(contentVariables ? { contentVariables } : {}),
    });
    return { id: res.sid, delivered: true };
  }

  private async sendMeta(msg: WhatsappMessage): Promise<{ id: string | null; delivered: boolean }> {
    const body = {
      messaging_product: 'whatsapp',
      to: msg.to,
      type: 'template',
      template: {
        name: msg.template,
        language: { code: 'en_GB' },
        components: msg.params.length
          ? [{ type: 'body', parameters: msg.params.map((text) => ({ type: 'text', text: String(text) })) }]
          : undefined,
      },
    };
    const res = await fetch(`${this.metaBaseUrl}/${this.metaPhoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.metaToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`WhatsApp Cloud API ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = (await res.json()) as { messages?: Array<{ id: string }> };
    return { id: data.messages?.[0]?.id ?? null, delivered: true };
  }
}
