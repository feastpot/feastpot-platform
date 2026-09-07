import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from '../../prisma/prisma.service';
import { NotificationEvent } from '../notifications/notification-events';
import { NotificationsService } from '../notifications/notifications.service';

import { type CateringEnquiryStatus } from './catering-enquiry-status';
import { isCateringEventDatePassed } from './catering-event-date';

const EXPIRABLE_STATUSES: CateringEnquiryStatus[] = ['NEW', 'UNASSIGNED'];
const EXPIRY_REASON = 'EVENT_DATE_PASSED_UNASSIGNED';

/**
 * Expires only intake rows which have never entered fulfilment. The conditional
 * update is the claim: assignment and concurrent cron instances cannot both win.
 * The matching outbox row is written in the same transaction as that claim.
 */
@Injectable()
export class CateringEnquiryExpiryService {
  private readonly logger = new Logger(CateringEnquiryExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'catering-enquiries-expire-past-event-date' })
  async expirePastEventDateEnquiries(): Promise<void> {
    const candidates = await this.prisma.cateringEnquiry.findMany({
      where: { status: { in: EXPIRABLE_STATUSES }, booking: { is: null } },
      select: { id: true, status: true, email: true, contactName: true, eventDate: true },
      take: 500,
    });
    let expired = 0;
    const now = new Date();
    for (const enquiry of candidates) {
      if (!isCateringEventDatePassed(enquiry.eventDate, now)) continue;
      const payload = {
        recipientEmail: enquiry.email,
        contactName: enquiry.contactName,
        enquiryId: enquiry.id,
        eventDate: enquiry.eventDate,
      };
      const jobId = `catering_enquiry_expired:${enquiry.id}`;
      const claimed = await this.prisma.$transaction(async (tx) => {
        const update = await tx.cateringEnquiry.updateMany({
          where: {
            id: enquiry.id,
            status: enquiry.status,
            booking: { is: null },
          },
          data: {
            status: 'EXPIRED',
            expiredAt: now,
            expiryReason: EXPIRY_REASON,
          },
        });
        if (update.count === 0) return null;
        return this.notifications.createTransactionalOutbox(
          tx,
          NotificationEvent.catering_enquiry_expired,
          payload,
          jobId,
        );
      });
      if (!claimed) continue;
      expired += 1;
      await this.notifications.dispatchTransactionalOutbox(
        claimed.id,
        NotificationEvent.catering_enquiry_expired,
        payload,
        jobId,
      );
    }
    if (expired) this.logger.log(`Expired ${expired} past-date unassigned catering enquiries`);
  }
}
