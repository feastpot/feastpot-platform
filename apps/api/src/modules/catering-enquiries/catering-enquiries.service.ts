import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CateringBookingStatus, VendorStatus } from '@prisma/client';

import { extractOutwardCode, normalisePostcode } from '../../common/postcode.util';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailProvider } from '../notifications/providers/email.provider';
import { WhatsappProvider } from '../notifications/providers/whatsapp.provider';

import type { AssignCateringEnquiryDto } from './dto/assign-catering-enquiry.dto';
import type { CreateCateringEnquiryDto } from './dto/create-catering-enquiry.dto';
import { cateringEnquiryConfirmationTemplate } from './templates/catering-enquiry-confirmation.template';
import { cateringEnquiryInternalTemplate } from './templates/catering-enquiry-internal.template';

// Guest-count midpoints mirrored from catering-bookings.service (kept local to
// avoid a circular import between the two modules).
const GUEST_COUNT_MIDPOINTS: Record<string, number> = {
  '1-10': 8,
  '10-20': 15,
  '20-30': 25,
  '30-50': 40,
  '50-100': 75,
  '100-200': 150,
  '200+': 250,
};
function deriveGuestCount(band: string): number {
  return GUEST_COUNT_MIDPOINTS[band] ?? 20;
}

@Injectable()
export class CateringEnquiriesService {
  private readonly logger = new Logger(CateringEnquiriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailProvider,
    private readonly whatsapp: WhatsappProvider,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
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
        hearAboutUs: dto.hearAboutUs?.trim() || null,
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

    // Optional WhatsApp alert to the founder/ops number.
    const alertTo = this.config.get<string>('CATERING_ALERT_WHATSAPP_TO');
    const alertSid = this.config.get<string>('TWILIO_CONTENT_SID_catering_enquiry_alert');
    if (alertTo && alertSid) {
      this.whatsapp
        .send({
          to: alertTo,
          template: 'catering_enquiry_alert',
          params: [contactName, row.occasionType],
        })
        .catch((err: Error) =>
          this.logger.warn(`[catering-enquiry] WhatsApp alert failed: ${err.message}`),
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
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            vendorId: true,
            vendor: { select: { businessName: true, slug: true } },
          },
        },
      },
    });
    const page = rows.slice(0, limit);
    return {
      data: page,
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  }

  /** Admin: get single row with booking. */
  async getById(id: string) {
    return this.prisma.cateringEnquiry.findUniqueOrThrow({
      where: { id },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            vendorId: true,
            assignNote: true,
            vendor: { select: { businessName: true, slug: true } },
          },
        },
      },
    });
  }

  /** Admin: update status and/or notes. */
  async updateStatus(id: string, status: string, adminNotes?: string) {
    return this.prisma.cateringEnquiry.update({
      where: { id },
      data: { status, ...(adminNotes !== undefined ? { adminNotes } : {}) },
    });
  }

  // ---------------------------------------------------------------------------
  // Admin: assign an enquiry to a vendor
  // ---------------------------------------------------------------------------

  /** Assignable statuses - enquiry is not yet linked to a vendor/booking. */
  private static readonly ASSIGNABLE_STATUSES = new Set(['NEW', 'UNASSIGNED']);

  async assignEnquiry(
    enquiryId: string,
    dto: AssignCateringEnquiryDto,
    actorId: string,
  ): Promise<{ bookingId: string }> {
    const enquiry = await this.prisma.cateringEnquiry.findUnique({ where: { id: enquiryId } });
    if (!enquiry) throw new NotFoundException('Catering enquiry not found');
    if (!CateringEnquiriesService.ASSIGNABLE_STATUSES.has(enquiry.status)) {
      throw new BadRequestException({
        code: 'ENQUIRY_NOT_ASSIGNABLE',
        message: `Enquiry status is ${enquiry.status} - only NEW or UNASSIGNED enquiries can be assigned. Use /reassign to change an already-assigned enquiry.`,
      });
    }

    // Double-assign guard
    const existing = await this.prisma.cateringBooking.findUnique({ where: { enquiryId } });
    if (existing) {
      throw new BadRequestException({
        code: 'ALREADY_ASSIGNED',
        message: 'This enquiry already has a booking. Use /reassign to change the vendor.',
      });
    }

    const vendor = await this.validateVendorForCatering(dto.vendorId, enquiry.outwardCode);

    const eventDate = this.parseEventDate(enquiry.eventDate);
    const quoteExpiresAt = new Date(Date.now() + 7 * 86_400_000);

    const booking = await this.prisma.$transaction(async (tx) => {
      const b = await tx.cateringBooking.create({
        data: {
          enquiryId,
          vendorId: dto.vendorId,
          customerEmail: enquiry.email,
          customerName: enquiry.contactName,
          eventDate,
          guestCount: deriveGuestCount(enquiry.guestCountBand),
          eventAddress: enquiry.postcode,
          preferredTime: enquiry.preferredTime ?? null,
          totalPence: 0,
          depositPence: 0,
          balancePence: 0,
          commissionPercent: 0 as unknown as never,
          commissionPence: 0,
          status: CateringBookingStatus.ASSIGNED,
          quoteExpiresAt,
          assignNote: dto.note ?? null,
        },
      });
      await tx.cateringEnquiry.update({ where: { id: enquiryId }, data: { status: 'ASSIGNED' } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'catering_enquiry.assigned',
          entityType: 'catering_enquiries',
          entityId: enquiryId,
          metadata: {
            vendorId: dto.vendorId,
            vendorName: vendor.businessName,
            bookingId: b.id,
            note: dto.note ?? null,
          },
        },
      });
      return b;
    });

    // Notify vendor (fire-and-forget)
    this.notifications
      .enqueue(
        'catering_assignment',
        {
          userId: vendor.userId,
          bookingId: booking.id,
          contactName: enquiry.contactName,
          eventDate: enquiry.eventDate ?? null,
          guestCountBand: enquiry.guestCountBand,
          postcode: enquiry.postcode,
          cuisineStyle: enquiry.cuisineStyle ?? null,
          note: dto.note ?? null,
        },
        { jobId: `catering_assign:${booking.id}` },
      )
      .catch((e) => this.logger.warn(`[catering-assign] notify failed: ${String(e)}`));

    this.logger.log(
      `[catering-assign] enquiry=${enquiryId} -> vendor=${dto.vendorId} booking=${booking.id}`,
    );
    return { bookingId: booking.id };
  }

  // ---------------------------------------------------------------------------
  // Admin: reassign an enquiry to a different vendor
  // ---------------------------------------------------------------------------

  async reassignEnquiry(
    enquiryId: string,
    dto: AssignCateringEnquiryDto,
    actorId: string,
  ): Promise<{ bookingId: string }> {
    const enquiry = await this.prisma.cateringEnquiry.findUnique({ where: { id: enquiryId } });
    if (!enquiry) throw new NotFoundException('Catering enquiry not found');
    if (enquiry.status !== 'ASSIGNED') {
      throw new BadRequestException({
        code: 'ENQUIRY_NOT_ASSIGNED',
        message: 'Only ASSIGNED enquiries can be reassigned.',
      });
    }

    const existing = await this.prisma.cateringBooking.findUnique({
      where: { enquiryId },
      select: {
        id: true,
        status: true,
        vendorId: true,
        vendor: { select: { userId: true, businessName: true } },
      },
    });
    if (!existing) {
      throw new BadRequestException({
        code: 'NO_BOOKING',
        message: 'No booking found for this enquiry - use /assign instead.',
      });
    }
    if (existing.status !== CateringBookingStatus.ASSIGNED) {
      throw new BadRequestException({
        code: 'QUOTE_EXISTS_DECLINE_FIRST',
        message: `Cannot reassign after a quote has been submitted (booking is ${existing.status}). Ask the vendor to decline first.`,
      });
    }

    const newVendor = await this.validateVendorForCatering(dto.vendorId, enquiry.outwardCode);
    const oldVendor = existing.vendor;

    const eventDate = this.parseEventDate(enquiry.eventDate);
    const quoteExpiresAt = new Date(Date.now() + 7 * 86_400_000);

    const newBooking = await this.prisma.$transaction(async (tx) => {
      // Cancel old booking
      await tx.cateringBooking.update({
        where: { id: existing.id },
        data: {
          status: CateringBookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason: 'Reassigned to another vendor by admin',
        },
      });
      // Create new booking for new vendor
      const b = await tx.cateringBooking.create({
        data: {
          enquiryId,
          vendorId: dto.vendorId,
          customerEmail: enquiry.email,
          customerName: enquiry.contactName,
          eventDate,
          guestCount: deriveGuestCount(enquiry.guestCountBand),
          eventAddress: enquiry.postcode,
          preferredTime: enquiry.preferredTime ?? null,
          totalPence: 0,
          depositPence: 0,
          balancePence: 0,
          commissionPercent: 0 as unknown as never,
          commissionPence: 0,
          status: CateringBookingStatus.ASSIGNED,
          quoteExpiresAt,
          assignNote: dto.note ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'catering_enquiry.reassigned',
          entityType: 'catering_enquiries',
          entityId: enquiryId,
          metadata: {
            previousVendorId: existing.vendorId,
            previousVendorName: oldVendor?.businessName,
            newVendorId: dto.vendorId,
            newVendorName: newVendor.businessName,
            newBookingId: b.id,
            oldBookingId: existing.id,
            note: dto.note ?? null,
          },
        },
      });
      return b;
    });

    // Notify old vendor of cancellation (fire-and-forget)
    if (oldVendor?.userId) {
      this.notifications
        .enqueue(
          'catering_assignment_cancelled',
          {
            userId: oldVendor.userId,
            bookingId: existing.id,
            reason: 'Admin has reassigned this enquiry to another vendor.',
          },
          { jobId: `catering_reassign_cancel:${existing.id}` },
        )
        .catch((e) =>
          this.logger.warn(`[catering-reassign] old-vendor notify failed: ${String(e)}`),
        );
    }

    // Notify new vendor
    this.notifications
      .enqueue(
        'catering_assignment',
        {
          userId: newVendor.userId,
          bookingId: newBooking.id,
          contactName: enquiry.contactName,
          eventDate: enquiry.eventDate ?? null,
          guestCountBand: enquiry.guestCountBand,
          postcode: enquiry.postcode,
          cuisineStyle: enquiry.cuisineStyle ?? null,
          note: dto.note ?? null,
        },
        { jobId: `catering_assign:${newBooking.id}` },
      )
      .catch((e) => this.logger.warn(`[catering-reassign] new-vendor notify failed: ${String(e)}`));

    this.logger.log(
      `[catering-reassign] enquiry=${enquiryId} ${existing.vendorId} -> ${dto.vendorId} newBooking=${newBooking.id}`,
    );
    return { bookingId: newBooking.id };
  }

  // ---------------------------------------------------------------------------
  // Admin: search eligible vendors for an enquiry
  // ---------------------------------------------------------------------------

  async eligibleVendors(enquiryId: string, q?: string) {
    const enquiry = await this.prisma.cateringEnquiry.findUnique({
      where: { id: enquiryId },
      select: { outwardCode: true, postcode: true },
    });
    if (!enquiry) throw new NotFoundException('Enquiry not found');

    const vendors = await this.prisma.vendor.findMany({
      where: {
        status: VendorStatus.live,
        eventCateringManualQuote: true,
        ...(q
          ? {
              businessName: { contains: q, mode: 'insensitive' },
            }
          : {}),
      },
      select: {
        id: true,
        businessName: true,
        slug: true,
        cuisines: true,
        eventCateringManualQuote: true,
        deliveryConfig: {
          select: {
            postcodes: true,
            localRadiusMiles: true,
            latitude: true,
            longitude: true,
            kitchenPostcode: true,
          },
        },
      },
      orderBy: { businessName: 'asc' },
      take: 30,
    });

    return vendors.map((v) => {
      const postcodes = v.deliveryConfig?.postcodes ?? [];
      // Area coverage: soft check using the outward code prefix of the
      // vendor's postcode list. Admin can override if needed.
      const coversArea =
        postcodes.length === 0 ||
        postcodes.some((p) => {
          const out = extractOutwardCode(normalisePostcode(p));
          return out.toUpperCase() === enquiry.outwardCode.toUpperCase();
        });
      return {
        id: v.id,
        businessName: v.businessName,
        slug: v.slug,
        cuisines: v.cuisines,
        eventCateringManualQuote: v.eventCateringManualQuote,
        area: {
          postcodes,
          localRadiusMiles: v.deliveryConfig?.localRadiusMiles ?? null,
          latitude: v.deliveryConfig?.latitude ?? null,
          longitude: v.deliveryConfig?.longitude ?? null,
          kitchenPostcode: v.deliveryConfig?.kitchenPostcode ?? null,
        },
        coversArea,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async validateVendorForCatering(vendorId: string, enquiryOutwardCode: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: {
        id: true,
        businessName: true,
        userId: true,
        status: true,
        eventCateringManualQuote: true,
        deliveryConfig: { select: { postcodes: true } },
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    if (vendor.status !== VendorStatus.live) {
      throw new BadRequestException({
        code: 'VENDOR_NOT_LIVE',
        message: `Vendor is ${vendor.status} - only live vendors can accept catering assignments`,
      });
    }
    if (!vendor.eventCateringManualQuote) {
      throw new BadRequestException({
        code: 'VENDOR_NOT_CATERING_CAPABLE',
        message:
          'Vendor has not enabled event catering quotes. Ask them to enable it in their vendor profile before assigning.',
      });
    }

    // Soft area check - warn but don't block (admin has override intent by selecting this vendor)
    const postcodes = vendor.deliveryConfig?.postcodes ?? [];
    if (postcodes.length > 0) {
      const coversArea = postcodes.some((p) => {
        try {
          const out = extractOutwardCode(normalisePostcode(p));
          return out.toUpperCase() === enquiryOutwardCode.toUpperCase();
        } catch {
          return false;
        }
      });
      if (!coversArea) {
        this.logger.warn(
          `[catering-assign] vendor ${vendorId} service area (${postcodes.join(', ')}) may not cover outwardCode=${enquiryOutwardCode}`,
        );
      }
    }

    return vendor;
  }

  private parseEventDate(eventDateStr: string | null): Date {
    if (eventDateStr) {
      const d = new Date(eventDateStr);
      if (!isNaN(d.getTime())) return d;
    }
    // Placeholder: 30 days from now if the enquiry has no event date
    return new Date(Date.now() + 30 * 86_400_000);
  }
}
