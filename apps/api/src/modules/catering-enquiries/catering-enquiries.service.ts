import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { extractOutwardCode, normalisePostcode } from '../../common/postcode.util';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailProvider } from '../notifications/providers/email.provider';

import type { CreateCateringEnquiryDto } from './dto/create-catering-enquiry.dto';
import { cateringEnquiryConfirmationTemplate } from './templates/catering-enquiry-confirmation.template';
import { cateringEnquiryInternalTemplate } from './templates/catering-enquiry-internal.template';

@Injectable()
export class CateringEnquiriesService {
  private readonly logger = new Logger(CateringEnquiriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateCateringEnquiryDto): Promise<{ ok: true }> {
    // Honeypot
    if (dto.website) {
      this.logger.log('[catering-enquiry] honeypot triggered');
      return { ok: true };
    }

    const postcode = normalisePostcode(dto.postcode);
    const outwardCode = extractOutwardCode(postcode);
    const email = dto.email.trim().toLowerCase();
    const contactName = dto.contactName.trim();

    const row = await this.prisma.cateringEnquiry.create({
      data: {
        occasionType: dto.occasionType,
        guestCountBand: dto.guestCountBand,
        cuisineStyle: dto.cuisineStyle?.trim() || null,
        postcode,
        outwardCode,
        eventDate: dto.eventDate || null,
        preferredTime: dto.preferredTime?.trim() || null,
        budgetBand: dto.budgetBand || null,
        contactName,
        email,
        phone: dto.phone?.trim() || null,
        notes: dto.notes?.trim() || null,
        source: dto.source?.trim() || 'web',
        status: 'NEW',
      },
    });

    this.logger.log(`[catering-enquiry] saved id=${row.id} outwardCode=${outwardCode}`);

    // Notifications - fire-and-forget; never fail the request.
    const adminEmail =
      this.config.get<string>('VENDOR_APPLICATIONS_ADMIN_EMAIL') ?? 'soul@feastpot.co.uk';

    try {
      const internalMsg = cateringEnquiryInternalTemplate({ ...row });
      await this.email.send({
        to: adminEmail,
        subject: internalMsg.subject,
        html: internalMsg.html,
      });
    } catch (err) {
      this.logger.warn(`[catering-enquiry] internal alert failed: ${(err as Error).message}`);
    }

    try {
      const confirmMsg = cateringEnquiryConfirmationTemplate({
        contactName,
        postcode,
        eventDate: dto.eventDate,
        guestCountBand: dto.guestCountBand,
        cuisineStyle: dto.cuisineStyle,
      });
      await this.email.send({ to: email, subject: confirmMsg.subject, html: confirmMsg.html });
    } catch (err) {
      this.logger.warn(
        `[catering-enquiry] confirmation email failed for ${email}: ${(err as Error).message}`,
      );
    }

    return { ok: true };
  }

  /** Admin: paginated list, newest first. */
  async list(opts: { status?: string; cursor?: string; limit?: number }) {
    const limit = opts.limit ?? 50;
    const where = opts.status && opts.status !== 'ALL' ? { status: opts.status } : {};
    const rows = await this.prisma.cateringEnquiry.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    return {
      data: page,
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }

  /** Admin: get single row. */
  async getById(id: string) {
    return this.prisma.cateringEnquiry.findUniqueOrThrow({ where: { id } });
  }

  /** Admin: update status and/or notes. */
  async updateStatus(id: string, status: string, adminNotes?: string) {
    return this.prisma.cateringEnquiry.update({
      where: { id },
      data: { status, ...(adminNotes !== undefined ? { adminNotes } : {}) },
    });
  }
}
