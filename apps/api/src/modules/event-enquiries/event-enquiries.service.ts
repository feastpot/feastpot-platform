import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EnquiryStatus, QuoteStatus, UserRole, VendorStatus } from '@prisma/client';
import type { EventEnquiry } from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';
import { StripeService } from '../../stripe/stripe.service';
import { NotificationsService } from '../notifications/notifications.service';

import { ConfirmNumbersDto } from './dto/confirm-numbers.dto';
import { CreateEventEnquiryDto } from './dto/create-enquiry.dto';
import { ListEventEnquiriesDto } from './dto/list-enquiries.dto';
import { SelectVendorDto } from './dto/select-vendor.dto';
import { SubmitQuoteDto } from './dto/submit-quote.dto';

function startOfDayUtc(iso: string): Date {
  // Accepts `YYYY-MM-DD` (from <input type="date">) OR a full ISO timestamp.
  // We deliberately anchor to UTC so the admin filter is timezone-stable
  // across operator locales (everything in the DB is timestamptz).
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfDayUtc(iso: string): Date {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

const MIN_LEAD_DAYS = 7;
const QUOTE_WINDOW_HOURS = 24;
const DEFAULT_DEPOSIT_PCT = 30;
const MAX_MATCHED_VENDORS = 5;

interface PostcodeLatLng {
  latitude: number | null;
  longitude: number | null;
}

@Injectable()
export class EventEnquiriesService {
  private readonly logger = new Logger(EventEnquiriesService.name);
  /**
   * In-process geocode cache for postcodes.io. The matching path looks up the
   * enquiry postcode + every live vendor's collection postcode; without this,
   * a single match would fan out into N+1 outbound HTTP requests per call.
   */
  private readonly geocodeCache = new Map<string, PostcodeLatLng>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  async list(user: AuthUser, dto: ListEventEnquiriesDto) {
    const where: Record<string, unknown> = {};
    if (dto.status) where.status = dto.status;

    const isAdmin = user.role === UserRole.admin || user.role === UserRole.support;

    if (user.role === UserRole.customer) {
      where.customerId = user.id;
    } else if (user.role === UserRole.vendor) {
      // Vendor sees enquiries where they were matched OR they submitted a quote.
      const vendor = await this.prisma.vendor.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!vendor) return [];
      where.OR = [
        { matchedVendorIds: { has: vendor.id } },
        { quotes: { some: { vendorId: vendor.id } } },
      ];
    } else if (isAdmin) {
      // Cheap cross-field sanity check — surfaces typos in the UI rather
      // than silently returning an empty page.
      if (dto.eventFrom && dto.eventTo && dto.eventFrom > dto.eventTo) {
        throw new BadRequestException('eventFrom must be on or before eventTo');
      }
      if (dto.createdFrom && dto.createdTo && dto.createdFrom > dto.createdTo) {
        throw new BadRequestException('createdFrom must be on or before createdTo');
      }
      if (
        dto.budgetMin !== undefined &&
        dto.budgetMax !== undefined &&
        dto.budgetMin > dto.budgetMax
      ) {
        throw new BadRequestException('budgetMin must be less than or equal to budgetMax');
      }
      // Admin-only filters — silently ignored on customer/vendor scopes so
      // we can't accidentally widen visibility through a filter param.
      if (dto.q && dto.q.trim().length > 0) {
        const q = dto.q.trim();
        where.OR = [
          { customer: { email: { contains: q, mode: 'insensitive' } } },
          { customer: { firstName: { contains: q, mode: 'insensitive' } } },
          { customer: { lastName: { contains: q, mode: 'insensitive' } } },
          { postcode: { contains: q, mode: 'insensitive' } },
        ];
      }
      if (dto.eventFrom || dto.eventTo) {
        const range: Record<string, Date> = {};
        if (dto.eventFrom) range.gte = startOfDayUtc(dto.eventFrom);
        // `lte` on the raw `YYYY-MM-DD` would collapse to 00:00 and exclude
        // the rest of the day. Use end-of-day UTC so the picker is inclusive.
        if (dto.eventTo) range.lte = endOfDayUtc(dto.eventTo);
        where.eventDate = range;
      }
      if (dto.createdFrom || dto.createdTo) {
        const range: Record<string, Date> = {};
        if (dto.createdFrom) range.gte = startOfDayUtc(dto.createdFrom);
        if (dto.createdTo) range.lte = endOfDayUtc(dto.createdTo);
        where.createdAt = range;
      }
      if (dto.budgetMin !== undefined || dto.budgetMax !== undefined) {
        const range: Record<string, number> = {};
        if (dto.budgetMin !== undefined) range.gte = dto.budgetMin;
        if (dto.budgetMax !== undefined) range.lte = dto.budgetMax;
        where.budgetPence = range;
      }
    }

    // Admin/support uses keyset pagination on (createdAt, id) DESC so paging
    // is stable when seeds land on the same tick. Customer/vendor stay on the
    // legacy "take 200, array response" shape so the web/vendor apps don't
    // need to migrate.
    if (isAdmin) {
      const limit = dto.limit ?? 25;
      const cursor = dto.cursor ? this.decodeEnquiryCursor(dto.cursor) : null;
      const cursorWhere = cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }] },
            ],
          }
        : {};

      const [rows, total] = await Promise.all([
        this.prisma.eventEnquiry.findMany({
          where: { AND: [where, cursorWhere] },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          include: {
            quotes: {
              include: {
                vendor: { select: { id: true, businessName: true, slug: true, rating: true } },
              },
            },
            selectedVendor: { select: { id: true, businessName: true, slug: true } },
            customer: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        }),
        this.prisma.eventEnquiry.count({ where }),
      ]);

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page[page.length - 1];
      return {
        data: page,
        total,
        nextCursor: hasMore && last ? this.encodeEnquiryCursor(last.createdAt, last.id) : null,
      };
    }

    const rows = await this.prisma.eventEnquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        quotes: { include: { vendor: { select: { id: true, businessName: true, slug: true, rating: true } } } },
        selectedVendor: { select: { id: true, businessName: true, slug: true } },
        // Customer PII included so customer surfaces can render a
        // human-readable enquirer name. Vendors must NOT receive this - we
        // strip it below before returning to vendor callers.
        customer: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      take: 200,
    });

    // Vendors must only see their own quote rows on each enquiry - never
    // competitors' pricing or vendor identity. Strip customer PII too so the
    // marketplace stays neutral pre-booking.
    if (user.role === UserRole.vendor) {
      const vendor = await this.prisma.vendor.findUnique({ where: { userId: user.id }, select: { id: true } });
      const vid = vendor?.id;
      return rows.map(({ customer: _customer, ...r }) => ({
        ...r,
        quotes: r.quotes.filter((q) => q.vendorId === vid),
      }));
    }
    return rows;
  }

  private encodeEnquiryCursor(createdAt: Date, id: string): string {
    return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url');
  }

  private decodeEnquiryCursor(cursor: string): { createdAt: Date; id: string } | null {
    try {
      const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
      if (!iso || !id) return null;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      return { createdAt: d, id };
    } catch {
      return null;
    }
  }

  async getById(id: string, user: AuthUser) {
    const enquiry = await this.prisma.eventEnquiry.findUnique({
      where: { id },
      include: {
        quotes: {
          include: { vendor: { select: { id: true, businessName: true, slug: true, rating: true, ratingCount: true } } },
        },
        selectedVendor: { select: { id: true, businessName: true, slug: true } },
      },
    });
    if (!enquiry) throw new NotFoundException('Enquiry not found');

    if (user.role === UserRole.customer) {
      if (enquiry.customerId !== user.id) throw new ForbiddenException();
      return enquiry;
    }
    if (user.role === UserRole.vendor) {
      const vendor = await this.prisma.vendor.findUnique({ where: { userId: user.id }, select: { id: true } });
      if (!vendor) throw new ForbiddenException();
      const matched = enquiry.matchedVendorIds.includes(vendor.id);
      const quoted = enquiry.quotes.some((q) => q.vendorId === vendor.id);
      if (!matched && !quoted) throw new ForbiddenException();
      // Hide other vendors' quotes from this vendor.
      return { ...enquiry, quotes: enquiry.quotes.filter((q) => q.vendorId === vendor.id) };
    }
    return enquiry; // admin
  }

  // ---------------------------------------------------------------------------
  // Create + match
  // ---------------------------------------------------------------------------

  async create(customerId: string, dto: CreateEventEnquiryDto) {
    const eventDate = new Date(dto.eventDate);
    const minDate = new Date(Date.now() + MIN_LEAD_DAYS * 24 * 60 * 60 * 1000);
    if (eventDate.getTime() < minDate.getTime()) {
      throw new BadRequestException(`Event date must be at least ${MIN_LEAD_DAYS} days from today`);
    }
    if (dto.guestCount < 10) {
      throw new BadRequestException('Minimum guest count is 10');
    }

    const enquiry = await this.prisma.eventEnquiry.create({
      data: {
        customerId,
        eventType: dto.eventType,
        guestCount: dto.guestCount,
        eventDate,
        postcode: dto.postcode.toUpperCase(),
        budgetPence: dto.budgetPence ?? null,
        cuisines: dto.cuisines,
        dietary: dto.dietary ?? [],
        notes: dto.notes ?? null,
        quoteDeadline: new Date(Date.now() + QUOTE_WINDOW_HOURS * 60 * 60 * 1000),
        status: EnquiryStatus.open,
      },
    });

    // Vendor matching is best-effort - failure must NOT abort enquiry creation.
    this.matchVendors(enquiry).catch((e) =>
      this.logger.error(`matchVendors failed for ${enquiry.id}: ${(e as Error).message}`),
    );

    return enquiry;
  }

  /**
   * Match up to 5 live vendors by:
   *  1. vendor.status == live
   *  2. cuisine overlap (or any vendor if enquiry.cuisines is empty)
   *  3. delivery radius covers the enquiry postcode (haversine vs collectionAddress
   *     postcode if present, else using vendor's first whitelisted postcode)
   * Persists `matched_vendor_ids` and notifies each matched vendor.
   */
  async matchVendors(enquiry: EventEnquiry): Promise<string[]> {
    const enquiryGeo = await this.geocodePostcode(enquiry.postcode);

    const where: Record<string, unknown> = { status: VendorStatus.live };
    if (enquiry.cuisines.length > 0) {
      where.cuisines = { hasSome: enquiry.cuisines };
    }
    const vendors = await this.prisma.vendor.findMany({
      where,
      include: { deliveryConfig: true, user: { select: { id: true } } },
      take: 50,
    });

    const matched: { vendorId: string; userId: string }[] = [];
    for (const v of vendors) {
      const cfg = v.deliveryConfig;
      const radiusMiles = cfg?.localRadiusMiles ?? 5;
      const vendorPostcode = (cfg?.postcodes?.[0] ?? this.parsePostcodeFromAddress(cfg?.collectionAddress ?? null));
      if (!vendorPostcode || enquiryGeo.latitude == null || enquiryGeo.longitude == null) {
        // If we can't compute distance, fall back to "matched" so we don't
        // accidentally exclude every vendor when geocoding fails.
        matched.push({ vendorId: v.id, userId: v.user.id });
      } else {
        const vGeo = await this.geocodePostcode(vendorPostcode);
        if (vGeo.latitude == null || vGeo.longitude == null) {
          matched.push({ vendorId: v.id, userId: v.user.id });
        } else {
          const miles = haversineMiles(
            { lat: enquiryGeo.latitude, lng: enquiryGeo.longitude },
            { lat: vGeo.latitude, lng: vGeo.longitude },
          );
          if (miles <= radiusMiles) matched.push({ vendorId: v.id, userId: v.user.id });
        }
      }
      if (matched.length >= MAX_MATCHED_VENDORS) break;
    }

    if (matched.length === 0) {
      this.logger.warn(`No vendors matched for enquiry ${enquiry.id}`);
      return [];
    }

    await this.prisma.eventEnquiry.update({
      where: { id: enquiry.id },
      data: { matchedVendorIds: matched.map((m) => m.vendorId) },
    });

    await Promise.all(
      matched.map((m) =>
        this.notifications.enqueue(
          'event_enquiry_matched',
          {
            userId: m.userId,
            enquiryId: enquiry.id,
            eventType: enquiry.eventType,
            guestCount: enquiry.guestCount,
            eventDate: enquiry.eventDate.toISOString(),
            postcode: enquiry.postcode,
          },
          { jobId: `event_enquiry_matched:${enquiry.id}:${m.vendorId}` },
        ),
      ),
    );
    return matched.map((m) => m.vendorId);
  }

  // ---------------------------------------------------------------------------
  // Vendor: submit quote
  // ---------------------------------------------------------------------------

  async submitQuote(enquiryId: string, user: AuthUser, dto: SubmitQuoteDto) {
    const vendor = await this.prisma.vendor.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!vendor) throw new ForbiddenException('No vendor profile');

    const enquiry = await this.prisma.eventEnquiry.findUnique({ where: { id: enquiryId } });
    if (!enquiry) throw new NotFoundException('Enquiry not found');
    if (!enquiry.matchedVendorIds.includes(vendor.id)) {
      throw new ForbiddenException('You were not matched to this enquiry');
    }
    if (enquiry.quoteDeadline && enquiry.quoteDeadline.getTime() < Date.now()) {
      throw new BadRequestException('Quote deadline has passed');
    }
    if (enquiry.status !== EnquiryStatus.open && enquiry.status !== EnquiryStatus.quoted) {
      throw new BadRequestException(`Cannot quote: enquiry is ${enquiry.status}`);
    }

    const totalPence = dto.perHeadPence * enquiry.guestCount + dto.deliveryFeePence;

    const quote = await this.prisma.eventQuote.upsert({
      where: { enquiryId_vendorId: { enquiryId, vendorId: vendor.id } },
      update: {
        proposedMenu: dto.proposedMenu,
        perHeadPence: dto.perHeadPence,
        deliveryFeePence: dto.deliveryFeePence,
        minDepositPct: dto.minDepositPct,
        terms: dto.terms ?? null,
        pricePence: totalPence,
        expiresAt: new Date(dto.expiresAt),
        status: QuoteStatus.submitted,
      },
      create: {
        enquiryId,
        vendorId: vendor.id,
        proposedMenu: dto.proposedMenu,
        perHeadPence: dto.perHeadPence,
        deliveryFeePence: dto.deliveryFeePence,
        minDepositPct: dto.minDepositPct,
        terms: dto.terms ?? null,
        pricePence: totalPence,
        expiresAt: new Date(dto.expiresAt),
        status: QuoteStatus.submitted,
      },
    });

    await this.prisma.eventEnquiry.update({
      where: { id: enquiryId },
      data: { status: EnquiryStatus.quoted },
    });

    await this.notifications.enqueue(
      'event_quote_received',
      {
        userId: enquiry.customerId,
        enquiryId,
        vendorId: vendor.id,
        totalPence,
      },
      { jobId: `event_quote_received:${enquiryId}:${vendor.id}` },
    );

    return quote;
  }

  // ---------------------------------------------------------------------------
  // Customer: select vendor + create deposit PI
  // ---------------------------------------------------------------------------

  /**
   * Reserve a vendor and create a deposit PaymentIntent - but DO NOT yet
   * accept the quote, expire siblings, or flip the enquiry to `confirmed`.
   * Those state changes happen in `confirmDeposit()` after Stripe confirms
   * the payment really succeeded. This prevents an unpaid customer from
   * locking out other quotes.
   *
   * Idempotent: if `depositPiId` is already set for the same vendor, returns
   * the existing PI's client_secret. If set for a different vendor, rejects.
   */
  async selectVendor(enquiryId: string, customerId: string, dto: SelectVendorDto) {
    const enquiry = await this.prisma.eventEnquiry.findUnique({
      where: { id: enquiryId },
      include: { quotes: true },
    });
    if (!enquiry) throw new NotFoundException('Enquiry not found');
    if (enquiry.customerId !== customerId) throw new ForbiddenException();
    if (enquiry.status === EnquiryStatus.confirmed) {
      throw new BadRequestException('Enquiry already confirmed');
    }

    const quote = enquiry.quotes.find((q) => q.vendorId === dto.vendorId && q.status === QuoteStatus.submitted);
    if (!quote) throw new BadRequestException('No submitted quote from that vendor');

    const baseTotal = quote.perHeadPence * enquiry.guestCount + quote.deliveryFeePence;
    const depositPct = quote.minDepositPct || DEFAULT_DEPOSIT_PCT;
    const depositPence = Math.max(50, Math.round((baseTotal * depositPct) / 100));

    // Already reserved with same vendor → idempotent retry.
    if (enquiry.depositPiId && enquiry.vendorId === dto.vendorId) {
      const existing = await this.stripe.retrieve(enquiry.depositPiId);
      return { enquiry, clientSecret: existing.client_secret, depositPence };
    }
    // Already reserved with a *different* vendor - caller must explicitly
    // release before switching (no automatic flip during pending payment).
    if (enquiry.depositPiId && enquiry.vendorId && enquiry.vendorId !== dto.vendorId) {
      throw new BadRequestException('A deposit is already pending for another vendor on this enquiry');
    }

    // Stripe idempotency key prevents duplicate PIs on network retry.
    const pi = await this.stripe.createPaymentIntentGeneric({
      amountPence: depositPence,
      captureMethod: 'manual',
      metadata: { enquiryId, vendorId: dto.vendorId, customerId, kind: 'event_deposit' },
      idempotencyKey: `event_deposit:${enquiryId}:${dto.vendorId}`,
    });

    // Conditional update: only persist if no concurrent request beat us.
    const claim = await this.prisma.eventEnquiry.updateMany({
      where: { id: enquiryId, depositPiId: null },
      data: { vendorId: dto.vendorId, depositPiId: pi.id },
    });
    if (claim.count === 0) {
      // Race lost - another request beat us. Only return the winner if it's
      // the same vendor; otherwise cancel our orphan PI and reject so the
      // customer can't bind two different vendors to one enquiry.
      const fresh = await this.prisma.eventEnquiry.findUnique({ where: { id: enquiryId } });
      if (fresh?.depositPiId && fresh.vendorId === dto.vendorId) {
        const winner = await this.stripe.retrieve(fresh.depositPiId);
        return { enquiry: fresh, clientSecret: winner.client_secret, depositPence };
      }
      await this.stripe.cancel(pi.id).catch((e) =>
        this.logger.warn(`failed to cancel orphan deposit PI ${pi.id}: ${(e as Error).message}`),
      );
      throw new BadRequestException('A deposit is already pending for another vendor on this enquiry');
    }

    const updated = await this.prisma.eventEnquiry.findUnique({
      where: { id: enquiryId },
      include: { quotes: true, selectedVendor: { select: { id: true, businessName: true } } },
    });
    return { enquiry: updated, clientSecret: pi.client_secret, depositPence };
  }

  /**
   * Finalize the booking *after* the customer has paid the deposit. Verifies
   * the PI status with Stripe (source of truth - never trust the client),
   * then atomically marks the chosen quote accepted, expires sibling quotes,
   * and flips the enquiry to `confirmed`. Safe to call multiple times.
   */
  async confirmDeposit(enquiryId: string, customerId: string) {
    const enquiry = await this.prisma.eventEnquiry.findUnique({ where: { id: enquiryId } });
    if (!enquiry) throw new NotFoundException('Enquiry not found');
    if (enquiry.customerId !== customerId) throw new ForbiddenException();
    if (enquiry.status === EnquiryStatus.confirmed) return enquiry;
    if (!enquiry.depositPiId || !enquiry.vendorId) {
      throw new BadRequestException('No deposit reserved for this enquiry');
    }

    const pi = await this.stripe.retrieve(enquiry.depositPiId);
    // Manual-capture flow lands at requires_capture once the customer has
    // authorized; succeeded covers the auto-capture / already-captured case.
    const ok = pi.status === 'requires_capture' || pi.status === 'succeeded';
    if (!ok) throw new BadRequestException(`Deposit not yet paid (status: ${pi.status})`);
    if (pi.metadata?.enquiryId !== enquiryId) {
      // Defence-in-depth: the PI must belong to this enquiry.
      throw new BadRequestException('PaymentIntent metadata mismatch');
    }

    return this.prisma.$transaction(async (tx) => {
      // Conditional flip: only the first caller actually transitions the row.
      const claim = await tx.eventEnquiry.updateMany({
        where: { id: enquiryId, status: { not: EnquiryStatus.confirmed } },
        data: { status: EnquiryStatus.confirmed, confirmedAt: new Date() },
      });
      if (claim.count > 0) {
        await tx.eventQuote.updateMany({
          where: { enquiryId, vendorId: enquiry.vendorId!, status: QuoteStatus.submitted },
          data: { status: QuoteStatus.accepted, acceptedAt: new Date() },
        });
        await tx.eventQuote.updateMany({
          where: { enquiryId, vendorId: { not: enquiry.vendorId! }, status: QuoteStatus.submitted },
          data: { status: QuoteStatus.expired },
        });
      }
      return tx.eventEnquiry.findUnique({
        where: { id: enquiryId },
        include: { quotes: true, selectedVendor: { select: { id: true, businessName: true } } },
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Customer: confirm final numbers
  // ---------------------------------------------------------------------------

  async confirmNumbers(enquiryId: string, customerId: string, dto: ConfirmNumbersDto) {
    const enquiry = await this.prisma.eventEnquiry.findUnique({
      where: { id: enquiryId },
      include: { quotes: { where: { status: QuoteStatus.accepted } } },
    });
    if (!enquiry) throw new NotFoundException('Enquiry not found');
    if (enquiry.customerId !== customerId) throw new ForbiddenException();
    if (enquiry.status !== EnquiryStatus.confirmed) {
      throw new BadRequestException('Enquiry not confirmed yet');
    }

    const accepted = enquiry.quotes[0];
    if (!accepted) throw new BadRequestException('No accepted quote on this enquiry');

    const finalTotal = accepted.perHeadPence * dto.guestCount + accepted.deliveryFeePence;
    const depositPct = accepted.minDepositPct || DEFAULT_DEPOSIT_PCT;
    const depositPaid = Math.round((accepted.perHeadPence * enquiry.guestCount + accepted.deliveryFeePence) * depositPct / 100);
    const balancePence = Math.max(0, finalTotal - depositPaid);

    let balancePiId = enquiry.balancePiId;
    if (balancePence > 0 && !balancePiId) {
      const pi = await this.stripe.createPaymentIntentGeneric({
        amountPence: balancePence,
        captureMethod: 'manual',
        metadata: { enquiryId, customerId, kind: 'event_balance' },
        idempotencyKey: `event_balance:${enquiryId}`,
      });
      // Conditional claim - if cron raced us, cancel the duplicate PI.
      const claim = await this.prisma.eventEnquiry.updateMany({
        where: { id: enquiryId, balancePiId: null },
        data: { balancePiId: pi.id },
      });
      if (claim.count === 0) {
        await this.stripe.cancel(pi.id).catch((e) =>
          this.logger.warn(`failed to cancel orphaned balance PI ${pi.id}: ${(e as Error).message}`),
        );
        const fresh = await this.prisma.eventEnquiry.findUnique({ where: { id: enquiryId }, select: { balancePiId: true } });
        balancePiId = fresh?.balancePiId ?? null;
      } else {
        balancePiId = pi.id;
      }
    }

    return this.prisma.eventEnquiry.update({
      where: { id: enquiryId },
      data: {
        finalGuestCount: dto.guestCount,
        menuAdjustments: dto.menuAdjustments ?? null,
        balancePiId,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async geocodePostcode(postcode: string): Promise<PostcodeLatLng> {
    const key = postcode.replace(/\s+/g, '').toUpperCase();
    const cached = this.geocodeCache.get(key);
    if (cached) return cached;
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(key)}`);
      if (!res.ok) {
        const miss: PostcodeLatLng = { latitude: null, longitude: null };
        this.geocodeCache.set(key, miss);
        return miss;
      }
      const json = (await res.json()) as { result?: { latitude?: number; longitude?: number } };
      const lat = json.result?.latitude;
      const lng = json.result?.longitude;
      const out: PostcodeLatLng = {
        latitude: typeof lat === 'number' ? lat : null,
        longitude: typeof lng === 'number' ? lng : null,
      };
      this.geocodeCache.set(key, out);
      return out;
    } catch (e) {
      this.logger.warn(`geocode failed for ${postcode}: ${(e as Error).message}`);
      const miss: PostcodeLatLng = { latitude: null, longitude: null };
      this.geocodeCache.set(key, miss);
      return miss;
    }
  }

  private parsePostcodeFromAddress(addr: string | null): string | null {
    if (!addr) return null;
    // UK postcode regex (loose)
    const m = addr.match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i);
    return m ? m[0].toUpperCase() : null;
  }
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8; // miles
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sa = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(sa));
}
