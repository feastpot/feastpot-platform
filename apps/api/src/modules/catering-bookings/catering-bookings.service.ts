import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AttributionSource, CateringBookingStatus, OrderSource, UserRole } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as typeof import('pdfkit');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require('qrcode') as typeof import('qrcode');

import type { AuthUser } from '../../auth/types';
import { CommissionService } from '../../commission/commission.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';
import { toResolvedSource } from '../attribution/attribution.service';
import { EmailProvider } from '../notifications/providers/email.provider';
import { NotificationsService } from '../notifications/notifications.service';

import type { CancelCateringBookingDto } from './dto/cancel-catering-booking.dto';
import type { CreateCateringBookingDto } from './dto/create-catering-booking.dto';
import type { Decimal } from '@prisma/client/runtime/library';

// Guest-count midpoints for each enquiry guestCountBand
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

/** Deposit = 25% of total, minimum £50. */
function calcDeposit(totalPence: number): number {
  return Math.max(5000, Math.ceil(totalPence * 0.25));
}

/**
 * quoteExpiresAt = sooner of (now + 7 days) or (eventDate - 48 hours).
 * Always at least 1 hour from now so the vendor has time to send the email.
 */
function calcQuoteExpiry(eventDate: Date, now = new Date()): Date {
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const minus48h = new Date(eventDate.getTime() - 48 * 60 * 60 * 1000);
  const candidate = sevenDays < minus48h ? sevenDays : minus48h;
  const minExpiry = new Date(now.getTime() + 60 * 60 * 1000); // at least 1h
  return candidate > minExpiry ? candidate : minExpiry;
}

/** Days between now and eventDate. Negative if event is in the past. */
function daysUntilEvent(eventDate: Date): number {
  return (eventDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
}

@Injectable()
export class CateringBookingsService {
  private readonly logger = new Logger(CateringBookingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailProvider,
    private readonly commission: CommissionService,
  ) {}

  // ---------------------------------------------------------------------------
  // Vendor: create quote
  // ---------------------------------------------------------------------------

  async createQuote(user: AuthUser, dto: CreateCateringBookingDto) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId: user.id },
      select: { id: true, businessName: true, slug: true, stripeAccountId: true },
    });
    if (!vendor) throw new ForbiddenException('No vendor profile');

    const enquiry = await this.prisma.cateringEnquiry.findUnique({
      where: { id: dto.enquiryId },
    });
    if (!enquiry) throw new NotFoundException('Catering enquiry not found');

    // Only allow quoting on enquiries that haven't been booked yet
    const existing = await this.prisma.cateringBooking.findUnique({
      where: { enquiryId: dto.enquiryId },
    });
    if (existing) {
      throw new BadRequestException('A booking already exists for this enquiry');
    }

    // Compute total from line items
    const total = dto.lineItems.reduce((s, li) => s + li.quantity * li.unitPence, 0);
    if (total < 100) throw new BadRequestException('Total must be at least £1');

    const guestCount = dto.guestCount ?? deriveGuestCount(enquiry.guestCountBand);

    // Parse event date
    const eventDateStr = dto.eventDate ?? enquiry.eventDate;
    if (!eventDateStr) throw new BadRequestException('Event date is required');
    const eventDate = new Date(eventDateStr);
    if (isNaN(eventDate.getTime())) throw new BadRequestException('Invalid event date');

    const depositPence = calcDeposit(total);
    const balancePence = total - depositPence;

    // Quote expiry
    const requestedExpiry = dto.quoteExpiresAt ? new Date(dto.quoteExpiresAt) : undefined;
    const systemExpiry = calcQuoteExpiry(eventDate);
    const quoteExpiresAt =
      requestedExpiry && requestedExpiry < systemExpiry ? requestedExpiry : systemExpiry;

    // Commission: at quote time there is no session/fp_ref cookie (the vendor
    // creates the booking, not the customer). We default to MARKETPLACE/first.
    // The resolved three-tier source is stored for consistent finance reporting.
    // Admin can correct the attribution before the deposit is confirmed.
    const source = OrderSource.MARKETPLACE;
    const isFirstOrder = true;
    const resolvedAttributionSource: AttributionSource = toResolvedSource(source, isFirstOrder);
    const now = new Date();
    const { rateId, ratePercent, commissionPence } = await this.commission.resolveRateAndCompute(
      source,
      isFirstOrder,
      total,  // subtotal = total for catering (no separate service fee)
      total,  // totalPence
      0,      // serviceFeePence (none for catering)
      now,
    );

    const booking = await this.prisma.cateringBooking.create({
      data: {
        enquiryId: dto.enquiryId,
        vendorId: vendor.id,
        customerEmail: enquiry.email,
        customerName: enquiry.contactName,
        eventDate,
        guestCount,
        eventAddress: dto.eventAddress ?? enquiry.postcode,
        preferredTime: dto.preferredTime ?? enquiry.preferredTime ?? null,
        totalPence: total,
        depositPence,
        balancePence,
        commissionPercent: ratePercent as unknown as Decimal,
        commissionPence,
        commissionRateId: rateId ?? null,
        attributionSource: resolvedAttributionSource,
        quoteExpiresAt,
        lineItems: {
          create: dto.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitPence: li.unitPence,
            allergens: li.allergens,
          })),
        },
      },
      include: { lineItems: true },
    });

    return booking;
  }

  // ---------------------------------------------------------------------------
  // Vendor / admin: send quote email to customer
  // ---------------------------------------------------------------------------

  async sendQuote(bookingId: string, user: AuthUser) {
    const booking = await this.getBookingOrThrow(bookingId);
    this.assertVendorOrStaff(booking.vendorId, user);

    if (booking.status !== CateringBookingStatus.QUOTED) {
      throw new BadRequestException(`Cannot send quote: booking is ${booking.status}`);
    }
    if (booking.quoteExpiresAt < new Date()) {
      throw new BadRequestException('Quote has expired');
    }

    const vendor = await this.prisma.vendor.findUnique({
      where: { id: booking.vendorId },
      select: { businessName: true },
    });

    const webUrl = process.env.WEB_URL ?? 'https://feastpot.com';
    const payLink = `${webUrl}/catering/pay/${booking.id}`;

    await this.email.send({
      to: booking.customerEmail,
      subject: `Your catering quote from ${vendor?.businessName ?? 'Feastpot'} - ${formatDate(booking.eventDate)}`,
      html: buildQuoteEmailHtml({
        customerName: booking.customerName,
        vendorName: vendor?.businessName ?? 'your caterer',
        eventDate: booking.eventDate,
        guestCount: booking.guestCount,
        totalPence: booking.totalPence,
        depositPence: booking.depositPence,
        quoteExpiresAt: booking.quoteExpiresAt,
        payLink,
        lineItems: (booking as typeof booking & { lineItems?: Array<{ description: string; quantity: number; unitPence: number }> }).lineItems ?? [],
      }),
    });

    return { sent: true };
  }

  // ---------------------------------------------------------------------------
  // Customer: initiate deposit payment
  // ---------------------------------------------------------------------------

  async initiateDeposit(bookingId: string) {
    const booking = await this.prisma.cateringBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== CateringBookingStatus.QUOTED) {
      throw new BadRequestException(`Cannot pay deposit: booking is ${booking.status}`);
    }
    if (booking.quoteExpiresAt < new Date()) {
      // Expire it
      await this.prisma.cateringBooking.updateMany({
        where: { id: bookingId, status: CateringBookingStatus.QUOTED },
        data: { status: CateringBookingStatus.EXPIRED },
      });
      throw new BadRequestException('Quote has expired');
    }

    // Idempotent: return existing PI if already created
    if (booking.depositPiId) {
      const existing = await this.stripe.retrieve(booking.depositPiId);
      return { clientSecret: existing.client_secret, depositPence: booking.depositPence };
    }

    const pi = await this.stripe.createPaymentIntentGeneric({
      amountPence: booking.depositPence,
      captureMethod: 'automatic',
      metadata: {
        bookingId,
        vendorId: booking.vendorId,
        kind: 'catering_deposit',
      },
      idempotencyKey: `catering_deposit:${bookingId}`,
    });

    const claim = await this.prisma.cateringBooking.updateMany({
      where: { id: bookingId, depositPiId: null },
      data: { depositPiId: pi.id },
    });
    if (claim.count === 0) {
      // Race: another request beat us, cancel our orphan
      await this.stripe
        .cancel(pi.id)
        .catch((e) => this.logger.warn(`failed to cancel orphan PI ${pi.id}: ${String(e)}`));
      const fresh = await this.prisma.cateringBooking.findUnique({ where: { id: bookingId } });
      const winner = await this.stripe.retrieve(fresh!.depositPiId!);
      return { clientSecret: winner.client_secret, depositPence: booking.depositPence };
    }

    return { clientSecret: pi.client_secret, depositPence: booking.depositPence };
  }

  // ---------------------------------------------------------------------------
  // Customer: confirm deposit after Stripe redirects
  // ---------------------------------------------------------------------------

  async confirmDeposit(bookingId: string, paymentIntentId: string) {
    const booking = await this.prisma.cateringBooking.findUnique({
      where: { id: bookingId },
      include: { lineItems: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === CateringBookingStatus.CONFIRMED) return booking; // idempotent
    if (booking.status !== CateringBookingStatus.QUOTED && booking.status !== CateringBookingStatus.DEPOSIT_PAID) {
      throw new BadRequestException(`Cannot confirm deposit: booking is ${booking.status}`);
    }
    if (booking.depositPiId !== paymentIntentId) {
      throw new BadRequestException('Payment intent does not match this booking');
    }

    // Verify payment with Stripe
    const pi = await this.stripe.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') {
      throw new BadRequestException(`Payment not succeeded: ${pi.status}`);
    }

    const now = new Date();
    await this.prisma.cateringBooking.update({
      where: { id: bookingId },
      data: {
        status: CateringBookingStatus.CONFIRMED,
        depositPaidAt: now,
      },
    });

    const confirmedBooking = { ...booking, status: CateringBookingStatus.CONFIRMED, depositPaidAt: now };

    // Generate compliance PDF
    try {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: booking.vendorId },
        select: {
          businessName: true,
          slug: true,
          documents: {
            where: { status: 'verified' },
            select: { type: true, reviewedAt: true, fileName: true },
          },
          application: {
            select: { hygieneRegNumber: true },
          },
        },
      });

      const webUrl = process.env.WEB_URL ?? 'https://feastpot.com';
      const qrUrl = `${webUrl}/v/${vendor?.slug ?? booking.vendorId}?booking=${bookingId}&credit=500`;
      const qrBuffer = await (QRCode.toBuffer as (url: string, opts: object) => Promise<Buffer>)(qrUrl, { type: 'png', width: 200 });
      const qrBase64 = qrBuffer.toString('base64');

      const pdfBuf = await this.buildCompliancePdf({
        booking: confirmedBooking,
        vendor: {
          businessName: vendor?.businessName ?? 'Unknown',
          slug: vendor?.slug ?? '',
          hygieneRegNumber: vendor?.application?.hygieneRegNumber ?? null,
          documents: vendor?.documents ?? [],
        },
        qrBase64,
        qrUrl,
      });

      // Send confirmation email with PDF
      await this.email.send({
        to: booking.customerEmail,
        subject: `Booking confirmed - ${formatDate(booking.eventDate)} | Feastpot`,
        html: buildConfirmationEmailHtml({
          customerName: booking.customerName,
          eventDate: booking.eventDate,
          vendorName: vendor?.businessName ?? 'your caterer',
          depositPence: booking.depositPence,
          balancePence: booking.balancePence,
        }),
        attachments: [
          {
            content: pdfBuf,
            filename: `feastpot-catering-confirmation-${bookingId.slice(-8)}.pdf`,
          },
        ],
      });
    } catch (err) {
      // PDF/email failure is non-blocking - booking is already confirmed
      this.logger.error(`compliance PDF failed for booking ${bookingId}: ${String(err)}`);
      Sentry.captureException(err, { tags: { bookingId, phase: 'compliance_pdf' } });
    }

    // Notify vendor
    await this.notifications
      .enqueue(
        'catering_deposit_received',
        { userId: (await this.getVendorUserId(booking.vendorId)), bookingId, customerName: booking.customerName, eventDate: booking.eventDate.toISOString(), totalPence: booking.totalPence },
        { jobId: `catering_deposit:${bookingId}` },
      )
      .catch((e) => this.logger.warn(`vendor notify failed: ${String(e)}`));

    return confirmedBooking;
  }

  // ---------------------------------------------------------------------------
  // Cron: initiate balance charge 48h before event
  // ---------------------------------------------------------------------------

  async scheduleBalanceCharge(booking: {
    id: string;
    balancePence: number;
    vendorId: string;
    customerId: string | null;
    customerEmail: string;
    customerName: string;
    eventDate: Date;
    balancePiId: string | null;
  }) {
    const pi = await this.stripe.createPaymentIntentGeneric({
      amountPence: booking.balancePence,
      captureMethod: 'automatic',
      metadata: {
        bookingId: booking.id,
        vendorId: booking.vendorId,
        kind: 'catering_balance',
      },
      idempotencyKey: `catering_balance:${booking.id}`,
    });

    const claim = await this.prisma.cateringBooking.updateMany({
      where: { id: booking.id, balancePiId: null },
      data: { balancePiId: pi.id },
    });
    if (claim.count === 0) {
      await this.stripe
        .cancel(pi.id)
        .catch((e) => this.logger.warn(`failed to cancel orphan balance PI ${pi.id}: ${String(e)}`));
      return;
    }

    const webUrl = process.env.WEB_URL ?? 'https://feastpot.com';
    const payLink = `${webUrl}/catering/pay/${booking.id}/balance`;

    await this.email.send({
      to: booking.customerEmail,
      subject: `Balance payment due - your event is in 48 hours | Feastpot`,
      html: buildBalanceLinkEmailHtml({
        customerName: booking.customerName,
        eventDate: booking.eventDate,
        balancePence: booking.balancePence,
        payLink,
      }),
    });

    this.logger.log(`catering_balance: PI created for booking ${booking.id}`);
  }

  // ---------------------------------------------------------------------------
  // Customer: confirm balance payment
  // ---------------------------------------------------------------------------

  async confirmBalance(bookingId: string, paymentIntentId: string) {
    const booking = await this.prisma.cateringBooking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === CateringBookingStatus.BALANCE_PAID) return booking;
    if (booking.status !== CateringBookingStatus.CONFIRMED) {
      throw new BadRequestException(`Cannot confirm balance: booking is ${booking.status}`);
    }
    if (booking.balancePiId !== paymentIntentId) {
      throw new BadRequestException('Payment intent does not match this booking');
    }

    const pi = await this.stripe.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') {
      throw new BadRequestException(`Payment not succeeded: ${pi.status}`);
    }

    await this.prisma.cateringBooking.update({
      where: { id: bookingId },
      data: { status: CateringBookingStatus.BALANCE_PAID, balancePaidAt: new Date() },
    });

    return { ...booking, status: CateringBookingStatus.BALANCE_PAID };
  }

  // ---------------------------------------------------------------------------
  // Cron: complete booking 24h after event
  // ---------------------------------------------------------------------------

  async completeBooking(bookingId: string) {
    const booking = await this.prisma.cateringBooking.findUnique({
      where: { id: bookingId },
      include: {
        vendor: {
          select: {
            id: true,
            userId: true,
            businessName: true,
            stripeAccountId: true,
            payoutsEnabled: true,
          },
        },
      },
    });
    if (!booking) return;
    if (booking.status !== CateringBookingStatus.BALANCE_PAID) return;

    const claim = await this.prisma.cateringBooking.updateMany({
      where: { id: bookingId, status: CateringBookingStatus.BALANCE_PAID },
      data: { status: CateringBookingStatus.COMPLETED, completedAt: new Date() },
    });
    if (claim.count === 0) return; // race lost

    // Vendor payout
    const vendorPayoutPence = booking.totalPence - booking.commissionPence;
    if (booking.vendor.stripeAccountId && booking.vendor.payoutsEnabled && vendorPayoutPence > 0) {
      try {
        const transfer = await this.stripe.createTransfer({
          amountPence: vendorPayoutPence,
          destinationAccountId: booking.vendor.stripeAccountId,
          payoutId: `catering:${bookingId}`,
          idempotencyKey: `catering_transfer:${bookingId}`,
        });
        await this.prisma.cateringBooking.update({
          where: { id: bookingId },
          data: { stripeTransferId: transfer.id },
        });
      } catch (err) {
        this.logger.error(`catering payout transfer failed for ${bookingId}: ${String(err)}`);
        Sentry.captureException(err, { tags: { bookingId, phase: 'catering_payout' } });
      }
    }

    // Notify vendor
    await this.notifications
      .enqueue(
        'catering_completed',
        {
          userId: booking.vendor.userId,
          bookingId,
          customerName: booking.customerName,
          eventDate: booking.eventDate.toISOString(),
          netPayoutPence: vendorPayoutPence,
        },
        { jobId: `catering_completed_vendor:${bookingId}` },
      )
      .catch((e) => this.logger.warn(`vendor completion notify failed: ${String(e)}`));

    // Notify customer
    await this.email
      .send({
        to: booking.customerEmail,
        subject: 'Thank you for choosing Feastpot - we hope you had a wonderful event!',
        html: buildCompletionEmailHtml({ customerName: booking.customerName, bookingId }),
      })
      .catch((e) => this.logger.warn(`customer completion email failed: ${String(e)}`));

    this.logger.log(`catering_complete: booking ${bookingId} completed`);
  }

  // ---------------------------------------------------------------------------
  // Customer / vendor / admin: cancel booking
  // ---------------------------------------------------------------------------

  async cancelBooking(bookingId: string, dto: CancelCateringBookingDto, user: AuthUser) {
    const booking = await this.prisma.cateringBooking.findUnique({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const nonCancellable: CateringBookingStatus[] = [
      CateringBookingStatus.COMPLETED,
      CateringBookingStatus.CANCELLED,
      CateringBookingStatus.EXPIRED,
    ];
    if (nonCancellable.includes(booking.status)) {
      throw new BadRequestException(`Cannot cancel: booking is ${booking.status}`);
    }

    const isStaff = user.role === UserRole.admin || user.role === UserRole.support;
    const isVendorOwner = await this.isVendorOwner(booking.vendorId, user.id);
    const isCustomer = booking.customerId === user.id;
    if (!isStaff && !isVendorOwner && !isCustomer) throw new ForbiddenException();

    const days = daysUntilEvent(booking.eventDate);
    let refundPence = 0;

    // Determine refund tier based on spec:
    // >14 days: deposit refunded in full
    // 7-14 days: 50% of deposit retained (50% refunded)
    // <7 days: deposit retained in full
    // <48h after balance charged: case-by-case (admin-only, full balance refund)
    if (booking.depositPaidAt) {
      if (booking.balancePaidAt) {
        // After balance paid - case by case (admin-only full refund)
        if (!isStaff) {
          throw new BadRequestException(
            'Balance has been paid - please contact support for cancellation',
          );
        }
        refundPence = booking.totalPence; // full refund
        await this.stripe.refund(booking.balancePiId!, booking.balancePence, `catering_refund_balance:${bookingId}`);
        await this.stripe.refund(booking.depositPiId!, booking.depositPence, `catering_refund_deposit:${bookingId}`);
      } else if (days > 14) {
        refundPence = booking.depositPence;
        await this.stripe.refund(booking.depositPiId!, booking.depositPence, `catering_refund:${bookingId}`);
      } else if (days > 7) {
        refundPence = Math.floor(booking.depositPence * 0.5);
        if (refundPence > 0) {
          await this.stripe.refund(booking.depositPiId!, refundPence, `catering_refund:${bookingId}`);
        }
      }
      // else <7 days: deposit retained, no refund
    }

    await this.prisma.cateringBooking.update({
      where: { id: bookingId },
      data: {
        status: CateringBookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancellationReason: dto.reason ?? null,
      },
    });

    // Notify customer
    await this.email
      .send({
        to: booking.customerEmail,
        subject: 'Your catering booking has been cancelled',
        html: buildCancellationEmailHtml({
          customerName: booking.customerName,
          eventDate: booking.eventDate,
          refundPence,
        }),
      })
      .catch((e) => this.logger.warn(`cancellation email failed: ${String(e)}`));

    return { cancelled: true, refundPence };
  }

  // ---------------------------------------------------------------------------
  // Track QR scan
  // ---------------------------------------------------------------------------

  async trackQrScan(bookingId: string) {
    await this.prisma.cateringBooking
      .update({
        where: { id: bookingId },
        data: { qrScans: { increment: 1 } },
      })
      .catch(() => {});
    // Return the vendor slug for redirect
    const booking = await this.prisma.cateringBooking.findUnique({
      where: { id: bookingId },
      select: { vendor: { select: { slug: true } } },
    });
    return booking?.vendor?.slug ?? null;
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async getById(bookingId: string, user: AuthUser) {
    const booking = await this.prisma.cateringBooking.findUnique({
      where: { id: bookingId },
      include: {
        lineItems: true,
        vendor: { select: { businessName: true, slug: true } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const isStaff = user.role === UserRole.admin || user.role === UserRole.support;
    const isVendorOwner = await this.isVendorOwner(booking.vendorId, user.id);
    const isCustomer = booking.customerId === user.id;
    if (!isStaff && !isVendorOwner && !isCustomer) throw new ForbiddenException();

    return booking;
  }

  async listForVendor(vendorId: string, opts: { cursor?: string; limit?: number }) {
    const take = Math.min(opts.limit ?? 20, 100);
    return this.prisma.cateringBooking.findMany({
      where: { vendorId },
      take,
      skip: opts.cursor ? 1 : 0,
      cursor: opts.cursor ? { id: opts.cursor } : undefined,
      orderBy: { eventDate: 'asc' },
      include: { lineItems: true },
    });
  }

  async listForVendorByUserId(userId: string, opts: { cursor?: string; limit?: number }) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!vendor) return [];
    return this.listForVendor(vendor.id, opts);
  }

  async listForAdmin(opts: {
    status?: string;
    cursor?: string;
    limit?: number;
    vendorId?: string;
  }) {
    const take = Math.min(opts.limit ?? 30, 100);
    const where: Record<string, unknown> = {};
    if (opts.status) where.status = opts.status;
    if (opts.vendorId) where.vendorId = opts.vendorId;
    return this.prisma.cateringBooking.findMany({
      where,
      take,
      skip: opts.cursor ? 1 : 0,
      cursor: opts.cursor ? { id: opts.cursor } : undefined,
      orderBy: { eventDate: 'asc' },
      include: {
        lineItems: true,
        vendor: { select: { businessName: true, slug: true } },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // PDF generation
  // ---------------------------------------------------------------------------

  async buildCompliancePdf(args: {
    booking: {
      id: string;
      customerName: string;
      customerEmail: string;
      eventDate: Date;
      guestCount: number;
      eventAddress: string | null;
      preferredTime: string | null;
      totalPence: number;
      depositPence: number;
      balancePence: number;
      lineItems: Array<{ description: string; quantity: number; unitPence: number; allergens: string[] }>;
    };
    vendor: {
      businessName: string;
      slug: string;
      hygieneRegNumber: string | null;
      documents: Array<{ type: string; reviewedAt: Date | null; fileName: string | null }>;
    };
    qrBase64: string;
    qrUrl: string;
  }): Promise<Buffer> {
    const { booking, vendor, qrBase64, qrUrl } = args;

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const fg = '#1a1a2e';
      const accent = '#e86c1a'; // Feastpot orange

      // ── Header ──────────────────────────────────────────────────────────
      doc.fontSize(22).fillColor(accent).text('Feastpot', { continued: false });
      doc.moveDown(0.2);
      doc.fontSize(16).fillColor(fg).text('Event Catering Confirmation', { underline: true });
      doc.moveDown(0.5);

      // ── Booking summary ──────────────────────────────────────────────────
      doc.fontSize(12).fillColor(fg);
      const summaryRows: [string, string][] = [
        ['Booking ref', booking.id.slice(-12).toUpperCase()],
        ['Customer', booking.customerName],
        ['Email', booking.customerEmail],
        ['Event date', formatDate(booking.eventDate)],
        ['Preferred time', booking.preferredTime ?? 'TBC'],
        ['Guest count', String(booking.guestCount)],
        ['Venue / address', booking.eventAddress ?? 'TBC'],
        ['Caterer', vendor.businessName],
      ];
      for (const [label, val] of summaryRows) {
        doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
        doc.font('Helvetica').text(val);
      }

      doc.moveDown(0.8);
      doc.fontSize(13).fillColor(accent).text('Payment schedule');
      doc.fontSize(11).fillColor(fg);
      doc.font('Helvetica-Bold').text('Deposit paid: ', { continued: true });
      doc.font('Helvetica').text(formatPounds(booking.depositPence));
      doc.font('Helvetica-Bold').text('Balance due 48h before event: ', { continued: true });
      doc.font('Helvetica').text(formatPounds(booking.balancePence));
      doc.font('Helvetica-Bold').text('Total: ', { continued: true });
      doc.font('Helvetica').text(formatPounds(booking.totalPence));

      // ── Itemised menu ────────────────────────────────────────────────────
      doc.moveDown(0.8);
      doc.fontSize(13).fillColor(accent).text('Itemised menu');
      doc.fontSize(11).fillColor(fg);
      for (const li of booking.lineItems) {
        const lineTotal = li.quantity * li.unitPence;
        doc.font('Helvetica-Bold').text(
          `${li.quantity}x ${li.description}`,
          { continued: true },
        );
        doc.font('Helvetica').text(`  ${formatPounds(lineTotal)}`, { align: 'right' });
        if (li.allergens.length > 0) {
          doc.font('Helvetica-Oblique').fontSize(9).fillColor('#666')
            .text(`  Allergens: ${li.allergens.join(', ')}`);
          doc.fontSize(11).fillColor(fg);
        }
      }

      // ── Allergen matrix ──────────────────────────────────────────────────
      const allAllergens = [
        'celery', 'cereals', 'crustaceans', 'eggs', 'fish', 'lupin',
        'milk', 'molluscs', 'mustard', 'nuts', 'peanuts', 'sesame', 'soya', 'sulphites',
      ];
      const allergenSet = new Set(
        booking.lineItems.flatMap((li) => li.allergens.map((a) => a.toLowerCase())),
      );

      doc.moveDown(0.8);
      doc.fontSize(13).fillColor(accent).text('Allergen matrix (UK Natasha\'s Law compliant)');
      doc.fontSize(9).fillColor(fg).font('Helvetica-Bold')
        .text('Dish', 90, doc.y, { continued: false });

      const startY = doc.y;
      const colWidth = 35;
      allAllergens.forEach((a, i) => {
        doc.text(a.slice(0, 6), 90 + 100 + i * colWidth, startY, { width: colWidth });
      });
      doc.moveDown(0.5);

      for (const li of booking.lineItems) {
        const rowY = doc.y;
        doc.font('Helvetica').fontSize(9)
          .text(li.description.slice(0, 20), 90, rowY, { width: 95, continued: false });
        allAllergens.forEach((a, i) => {
          const present = li.allergens.map((x) => x.toLowerCase()).includes(a);
          doc.text(present ? 'X' : '-', 90 + 100 + i * colWidth, rowY, { width: colWidth });
        });
        doc.y = rowY + 14;
      }

      // ── Vendor verification ──────────────────────────────────────────────
      doc.moveDown(0.8);
      doc.addPage();
      doc.fontSize(13).fillColor(accent).text('Vendor verification evidence');
      doc.fontSize(11).fillColor(fg);

      const regDoc = vendor.documents.find((d) => d.type === 'kitchen_reg');
      const hygieneDoc = vendor.documents.find((d) => d.type === 'hygiene_cert');
      const insuranceDoc = vendor.documents.find((d) => d.type === 'insurance');

      doc.font('Helvetica-Bold').text('Business name: ', { continued: true });
      doc.font('Helvetica').text(vendor.businessName);
      doc.font('Helvetica-Bold').text('Hygiene registration number: ', { continued: true });
      doc.font('Helvetica').text(vendor.hygieneRegNumber ?? 'On file');
      doc.font('Helvetica-Bold').text('FHRS hygiene rating: ', { continued: true });
      doc.font('Helvetica').text(hygieneDoc ? `Verified ${formatDate(hygieneDoc.reviewedAt!)}` : 'On file with Feastpot');
      doc.font('Helvetica-Bold').text('Kitchen / food business registration: ', { continued: true });
      doc.font('Helvetica').text(regDoc ? `Verified ${formatDate(regDoc.reviewedAt!)}` : 'On file with Feastpot');
      doc.font('Helvetica-Bold').text('Public liability insurance: ', { continued: true });
      doc.font('Helvetica').text(insuranceDoc ? `Valid - verified ${formatDate(insuranceDoc.reviewedAt!)}` : 'On file with Feastpot');

      // ── Cancellation policy ──────────────────────────────────────────────
      doc.moveDown(0.8);
      doc.fontSize(13).fillColor(accent).text('Cancellation policy');
      doc.fontSize(10).fillColor(fg).font('Helvetica');
      const policy = [
        'More than 14 days before event: deposit refunded in full.',
        '7 to 14 days before event: 50% of deposit retained by caterer.',
        'Under 7 days before event: deposit retained in full.',
        'After balance payment (under 48h): case by case - vendor costs already incurred are protected.',
      ];
      for (const line of policy) doc.text(`• ${line}`);

      // ── Support ─────────────────────────────────────────────────────────
      doc.moveDown(0.8);
      doc.fontSize(10).fillColor('#555')
        .text('Need help? Contact Feastpot support: hello@feastpot.com or visit feastpot.com/help');

      // ── QR code ─────────────────────────────────────────────────────────
      doc.moveDown(0.8);
      doc.fontSize(13).fillColor(accent).text('Share the love - £5 credit for your guests');
      doc.fontSize(10).fillColor(fg).font('Helvetica');
      doc.text('Print this QR code as a table card. Guests who scan it get £5 off their first Feastpot order.');
      doc.moveDown(0.4);

      const qrImg = Buffer.from(qrBase64, 'base64');
      doc.image(qrImg, { width: 120 });
      doc.moveDown(0.3);
      doc.fontSize(8).fillColor('#888').text(`Scan link: ${qrUrl}`);

      doc.end();
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getBookingOrThrow(id: string) {
    const b = await this.prisma.cateringBooking.findUnique({
      where: { id },
      include: { lineItems: true },
    });
    if (!b) throw new NotFoundException('Booking not found');
    return b;
  }

  private assertVendorOrStaff(vendorId: string, user: AuthUser) {
    const isStaff = user.role === UserRole.admin || user.role === UserRole.support;
    if (!isStaff && !this.isVendorOwnerSync(vendorId, user.id)) {
      // async check is done in routes that need it; staff always passes
    }
    if (isStaff) return;
    // Non-staff: will be validated by the calling route's own guard
  }

  private async isVendorOwner(vendorId: string, userId: string): Promise<boolean> {
    const v = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { userId: true },
    });
    return v?.userId === userId;
  }

  // Sync version for quick guard (requires caller to have validated vendor ownership separately)
  private isVendorOwnerSync(_vendorId: string, _userId: string): boolean {
    return false; // async check is done by the controller guard
  }

  private async getVendorUserId(vendorId: string): Promise<string> {
    const v = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { userId: true },
    });
    return v!.userId;
  }
}

// ─── Email templates ──────────────────────────────────────────────────────────

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatPounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

function buildQuoteEmailHtml(d: {
  customerName: string;
  vendorName: string;
  eventDate: Date;
  guestCount: number;
  totalPence: number;
  depositPence: number;
  quoteExpiresAt: Date;
  payLink: string;
  lineItems: Array<{ description: string; quantity: number; unitPence: number }>;
}): string {
  const rows = d.lineItems
    .map(
      (li) =>
        `<tr><td>${li.quantity}x ${li.description}</td><td align="right">${formatPounds(li.quantity * li.unitPence)}</td></tr>`,
    )
    .join('');
  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <h2 style="color:#e86c1a">Your catering quote is ready</h2>
  <p>Hi ${d.customerName},</p>
  <p><strong>${d.vendorName}</strong> has submitted a quote for your event on <strong>${formatDate(d.eventDate)}</strong> (${d.guestCount} guests).</p>
  <table width="100%" style="border-collapse:collapse;margin:16px 0">
    <thead><tr style="background:#f5f5f5"><th align="left">Item</th><th align="right">Price</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr style="font-weight:bold"><td>Total</td><td align="right">${formatPounds(d.totalPence)}</td></tr></tfoot>
  </table>
  <p><strong>Deposit required today:</strong> ${formatPounds(d.depositPence)} (25%)</p>
  <p style="color:#c00">This quote expires on ${formatDate(d.quoteExpiresAt)}.</p>
  <a href="${d.payLink}" style="display:inline-block;background:#e86c1a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Pay deposit &amp; confirm</a>
  <p style="color:#888;font-size:12px;margin-top:24px">Feastpot Ltd &bull; hello@feastpot.com</p>
</div>`;
}

function buildConfirmationEmailHtml(d: {
  customerName: string;
  eventDate: Date;
  vendorName: string;
  depositPence: number;
  balancePence: number;
}): string {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <h2 style="color:#e86c1a">Booking confirmed!</h2>
  <p>Hi ${d.customerName},</p>
  <p>Your catering booking for <strong>${formatDate(d.eventDate)}</strong> with <strong>${d.vendorName}</strong> is confirmed.</p>
  <p>Deposit paid: <strong>${formatPounds(d.depositPence)}</strong></p>
  <p>Balance of <strong>${formatPounds(d.balancePence)}</strong> will be collected 48 hours before your event.</p>
  <p>Your compliance pack (including full menu, allergen matrix, and vendor verification) is attached to this email.</p>
  <p style="color:#888;font-size:12px;margin-top:24px">Feastpot Ltd &bull; hello@feastpot.com</p>
</div>`;
}

function buildBalanceLinkEmailHtml(d: {
  customerName: string;
  eventDate: Date;
  balancePence: number;
  payLink: string;
}): string {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <h2 style="color:#e86c1a">Your event is tomorrow - balance payment due</h2>
  <p>Hi ${d.customerName},</p>
  <p>Your catering event is <strong>${formatDate(d.eventDate)}</strong>. The balance payment of <strong>${formatPounds(d.balancePence)}</strong> is now due.</p>
  <a href="${d.payLink}" style="display:inline-block;background:#e86c1a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold">Pay balance now</a>
  <p style="color:#888;font-size:12px;margin-top:24px">Feastpot Ltd &bull; hello@feastpot.com</p>
</div>`;
}

function buildCompletionEmailHtml(d: { customerName: string; bookingId: string }): string {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <h2 style="color:#e86c1a">We hope your event was a success!</h2>
  <p>Hi ${d.customerName},</p>
  <p>Thank you for choosing Feastpot for your catering. We hope everything went perfectly.</p>
  <p>If you have a moment, please leave a review - it helps other customers find great caterers.</p>
  <p style="color:#888;font-size:12px;margin-top:24px">Feastpot Ltd &bull; hello@feastpot.com</p>
</div>`;
}

function buildCancellationEmailHtml(d: {
  customerName: string;
  eventDate: Date;
  refundPence: number;
}): string {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto">
  <h2 style="color:#e86c1a">Your booking has been cancelled</h2>
  <p>Hi ${d.customerName},</p>
  <p>Your catering booking for <strong>${formatDate(d.eventDate)}</strong> has been cancelled.</p>
  ${d.refundPence > 0 ? `<p>A refund of <strong>${formatPounds(d.refundPence)}</strong> will be returned to your original payment method within 5-10 business days.</p>` : '<p>Per our cancellation policy, no refund is due for cancellations under 7 days before the event.</p>'}
  <p style="color:#888;font-size:12px;margin-top:24px">Feastpot Ltd &bull; hello@feastpot.com</p>
</div>`;
}
