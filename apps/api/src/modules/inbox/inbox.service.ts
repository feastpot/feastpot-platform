import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InboxNotificationType, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import type { ListInboxDto } from './dto/list-inbox.dto';

export interface NotifyInput {
  userId: string;
  type: InboxNotificationType;
  title: string;
  body: string;
  link?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * T007: in-app inbox.
 *
 * `notify()` is fire-and-forget at the call site: failures are swallowed
 * with a warn log so a transient DB hiccup never blocks the business
 * action (order creation, payout, etc.) that triggered the notification.
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotifyInput): Promise<void> {
    try {
      await this.prisma.inboxNotification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title.slice(0, 255),
          body: input.body,
          link: input.link ?? null,
          metadata: input.metadata ?? Prisma.JsonNull,
        },
      });
    } catch (err) {
      this.logger.warn(
        `inbox.notify failed for user=${input.userId} type=${input.type}: ${(err as Error).message}`,
      );
    }
  }

  async list(userId: string, dto: ListInboxDto) {
    const limit = dto.limit ?? 25;
    const cursor = dto.cursor ? this.decodeCursor(dto.cursor) : undefined;
    const cursorWhere: Prisma.InboxNotificationWhereInput = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};
    const unreadWhere: Prisma.InboxNotificationWhereInput =
      dto.unreadOnly === 'true' ? { readAt: null } : {};

    const rows = await this.prisma.inboxNotification.findMany({
      where: { AND: [{ userId }, cursorWhere, unreadWhere] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? this.encodeCursor(page[page.length - 1]!) : null;
    return { data: page, nextCursor };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.inboxNotification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  async markRead(userId: string, id: string) {
    const row = await this.prisma.inboxNotification.findUnique({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Not found' });
    if (row.userId !== userId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not your notification' });
    }
    if (row.readAt) return row;
    return this.prisma.inboxNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.inboxNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  // ----- cursor helpers -----
  private encodeCursor(row: { createdAt: Date; id: string }): string {
    return Buffer.from(JSON.stringify({ c: row.createdAt.toISOString(), id: row.id }), 'utf8').toString(
      'base64url',
    );
  }
  private decodeCursor(s: string): { createdAt: Date; id: string } | undefined {
    try {
      const obj = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as { c: string; id: string };
      return { createdAt: new Date(obj.c), id: obj.id };
    } catch {
      return undefined;
    }
  }
}
