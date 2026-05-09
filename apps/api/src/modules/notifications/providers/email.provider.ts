import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class EmailProvider {
  private readonly logger = new Logger(EmailProvider.name);
  private readonly client: Resend | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const key = config.get<string>('RESEND_API_KEY');
    this.from = config.get<string>('EMAIL_FROM') ?? 'Feastpot <noreply@feastpot.co.uk>';
    if (!key) {
      this.logger.warn('RESEND_API_KEY not set — emails will be logged only, never delivered.');
      this.client = null;
    } else {
      this.client = new Resend(key);
    }
  }

  async send(msg: EmailMessage): Promise<{ id: string | null; delivered: boolean }> {
    if (!this.client) {
      this.logger.log(`[stub-email] to=${msg.to} subject="${msg.subject}"`);
      return { id: null, delivered: false };
    }
    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
    });
    if (error) {
      // Surface so BullMQ retry kicks in.
      throw new Error(`Resend error: ${error.message ?? JSON.stringify(error)}`);
    }
    return { id: data?.id ?? null, delivered: true };
  }
}
