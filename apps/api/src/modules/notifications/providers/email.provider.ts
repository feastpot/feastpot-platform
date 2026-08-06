import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import { alertIfStubInProduction } from './stub-alert';

export interface EmailAttachment {
  content: Buffer;
  filename: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
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
      this.client = null;
      alertIfStubInProduction(this.logger, 'Email (Resend)', 'RESEND_API_KEY not set');
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
      ...(msg.attachments?.length
        ? {
            attachments: msg.attachments.map((a) => ({
              filename: a.filename,
              content: a.content.toString('base64'),
            })),
          }
        : {}),
    });
    if (error) {
      // Surface so BullMQ retry kicks in.
      throw new Error(`Resend error: ${error.message ?? JSON.stringify(error)}`);
    }
    return { id: data?.id ?? null, delivered: true };
  }
}
