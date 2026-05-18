import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WhatsappMessage {
  to: string; // E.164 phone number
  template: string; // pre-approved Meta template name
  params: Array<string | number>; // positional template parameters
}

@Injectable()
export class WhatsappProvider {
  private readonly logger = new Logger(WhatsappProvider.name);
  private readonly token: string | undefined;
  private readonly phoneNumberId: string | undefined;
  private readonly baseUrl = 'https://graph.facebook.com/v18.0';

  constructor(config: ConfigService) {
    this.token = config.get<string>('WHATSAPP_ACCESS_TOKEN');
    this.phoneNumberId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    if (!this.token || !this.phoneNumberId) {
      this.logger.warn('WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set - WhatsApp sends will be logged only.');
    }
  }

  async send(msg: WhatsappMessage): Promise<{ id: string | null; delivered: boolean }> {
    if (!this.token || !this.phoneNumberId) {
      this.logger.log(`[stub-wa] to=${msg.to} template=${msg.template}`);
      return { id: null, delivered: false };
    }
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
    const res = await fetch(`${this.baseUrl}/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
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
