import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';

import { PrismaService } from '../../../prisma/prisma.service';

export interface PushMessage {
  userId: string;
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

@Injectable()
export class PushProvider {
  private readonly logger = new Logger(PushProvider.name);
  private readonly enabled: boolean;

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    const subject = config.get<string>('VAPID_SUBJECT') ?? 'mailto:hello@feastpot.co.uk';
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) {
      this.logger.warn('VAPID keys not set — web push will be logged only.');
      this.enabled = false;
    } else {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.enabled = true;
    }
  }

  async send(msg: PushMessage): Promise<{ delivered: number; failed: number }> {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId: msg.userId } });
    if (!subs.length) return { delivered: 0, failed: 0 };
    if (!this.enabled) {
      this.logger.log(`[stub-push] userId=${msg.userId} subs=${subs.length} title="${msg.title}"`);
      return { delivered: 0, failed: 0 };
    }

    const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url, icon: msg.icon });
    let delivered = 0;
    let failed = 0;
    const stale: string[] = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        delivered++;
      } catch (e: unknown) {
        failed++;
        // 404/410 means the subscription is dead — clean it up so we don't keep
        // hammering it (and exhausting BullMQ attempts) on every event.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          stale.push(sub.id);
        } else {
          this.logger.warn(`Push failed (status=${status ?? '?'}) endpoint=${sub.endpoint.slice(0, 50)}…`);
        }
      }
    }
    if (stale.length) {
      await this.prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } });
      this.logger.log(`Pruned ${stale.length} dead push subscriptions`);
    }
    return { delivered, failed };
  }
}
