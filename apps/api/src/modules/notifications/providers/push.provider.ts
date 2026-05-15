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

export type BroadcastAudienceFilter =
  | { audience: 'all' }
  | { audience: 'by_city'; city: string }
  | { audience: 'by_cuisine'; cuisine: string };

export interface BroadcastPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

export interface BroadcastResult {
  audience: BroadcastAudienceFilter['audience'];
  recipients: number;
  delivered: number;
  failed: number;
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

  /**
   * Fan-out a single push payload to every subscription that matches the
   * audience filter. Used by the admin compose page; runs synchronously
   * and returns aggregated counts so the operator gets immediate feedback.
   *
   * Audience resolution:
   *   all          → every active push_subscription row
   *   by_city      → users with an address whose city matches (ILIKE)
   *   by_cuisine   → users who have placed an order, in the last 90 days,
   *                  with a vendor whose `cuisines[]` array contains the
   *                  given cuisine (lowercase comparison)
   *
   * Dead subscriptions (404/410) are pruned in the same loop so a broadcast
   * implicitly cleans up. We do not enqueue per-recipient jobs here — that
   * would add ~N rows to BullMQ for what's typically a one-shot operator
   * action; if a future broadcast targets >10k recipients we'll move this
   * onto the notifications queue.
   */
  async broadcast(
    filter: BroadcastAudienceFilter,
    payload: BroadcastPayload,
  ): Promise<BroadcastResult> {
    const userIds = await this.resolveUserIds(filter);
    const subs =
      filter.audience === 'all'
        ? await this.prisma.pushSubscription.findMany()
        : userIds.length
          ? await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } })
          : [];

    if (!subs.length) {
      return { audience: filter.audience, recipients: 0, delivered: 0, failed: 0 };
    }
    if (!this.enabled) {
      this.logger.log(
        `[stub-push:broadcast] audience=${filter.audience} recipients=${subs.length} title="${payload.title}"`,
      );
      return { audience: filter.audience, recipients: subs.length, delivered: 0, failed: 0 };
    }

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url,
      icon: payload.icon,
    });
    let delivered = 0;
    let failed = 0;
    const stale: string[] = [];

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
        delivered++;
      } catch (e: unknown) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) stale.push(sub.id);
      }
    }
    if (stale.length) {
      await this.prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } });
    }
    return { audience: filter.audience, recipients: subs.length, delivered, failed };
  }

  private async resolveUserIds(filter: BroadcastAudienceFilter): Promise<string[]> {
    if (filter.audience === 'all') return [];
    if (filter.audience === 'by_city') {
      const rows = await this.prisma.address.findMany({
        where: { city: { equals: filter.city, mode: 'insensitive' } },
        select: { userId: true },
        distinct: ['userId'],
      });
      return rows.map((r) => r.userId);
    }
    // by_cuisine — users with a recent order from a matching vendor.
    const cuisine = filter.cuisine.toLowerCase();
    const rows = await this.prisma.$queryRaw<Array<{ user_id: string }>>`
      SELECT DISTINCT o.customer_id AS user_id
      FROM orders o
      JOIN vendors v ON v.id = o.vendor_id
      WHERE LOWER(${cuisine}) = ANY (SELECT LOWER(c) FROM unnest(v.cuisines) c)
        AND o.created_at > NOW() - INTERVAL '90 days'
    `;
    return rows.map((r) => r.user_id);
  }
}
