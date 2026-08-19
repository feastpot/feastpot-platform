import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModerationStatus, OrderStatus, UserRole, VendorStatus } from '@prisma/client';
import type { VendorMemberRole } from '@prisma/client';
import type { Queue } from 'bull';

import type { AuthUser } from '../../auth/types';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { getServiceFeeBps } from '../../common/config/service-fee';
import { PrismaService } from '../../prisma/prisma.service';
import { NOTIFICATIONS_QUEUE } from '../../queues/queues.module';
import { StripeService } from '../../stripe/stripe.service';
import { SupabaseStorageService } from '../catalogue/supabase-storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailProvider } from '../notifications/providers/email.provider';
import { vendorApplicationAcknowledgedTemplate } from '../notifications/templates/vendor-application-acknowledged.template';
import { vendorApplicationReceivedTemplate } from '../notifications/templates/vendor-application-received.template';
import {
  VENDOR_AVAILABILITY_ROLES,
  VENDOR_PAYOUT_ROLES,
  VENDOR_PROFILE_WRITE_ROLES,
  VENDOR_READ_ROLES,
  VendorMembersService,
} from '../vendor-members/vendor-members.service';
import { isTaxProfileComplete } from '../vendor-tax-profile/vendor-tax-profile.service';

import { AddBlackoutDto } from './dto/add-blackout.dto';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { CursorPaginationDto } from './dto/pagination.dto';
import { RegisterVendorInterestDto } from './dto/register-vendor-interest.dto';
import { SearchVendorsDto } from './dto/search-vendors.dto';
import { UpdateAvailabilityDto } from './dto/update-availability.dto';
import { UpdateVendorComplianceDto } from './dto/update-vendor-compliance.dto';
import { UpdateVendorStatusDto } from './dto/update-vendor-status.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';
import { UpsertCapacityDto } from './dto/upsert-capacity.dto';
import { UpsertDeliveryConfigDto } from './dto/upsert-delivery-config.dto';
import {
  HourlyOrdersBucketDto,
  StripeConnectLinkResponseDto,
  TopDishDto,
  VendorAnalyticsResponseDto,
  WeeklyRevenueBucketDto,
} from './dto/vendor-analytics.dto';
import { VendorDashboardResponseDto } from './dto/vendor-dashboard.dto';
import { VendorStatsResponseDto } from './dto/vendor-stats.dto';
import { VendorRepository, type DecodedCursor, type SearchedVendorRow } from './vendors.repository';

const REVENUE_STATUSES_LIST: OrderStatus[] = [
  OrderStatus.accepted,
  OrderStatus.preparing,
  OrderStatus.dispatched,
  OrderStatus.delivered,
];

function formatCustomerName(
  c: { firstName: string | null; lastName: string | null } | null,
): string {
  if (!c) return 'Customer';
  const first = (c.firstName ?? '').trim();
  const last = (c.lastName ?? '').trim();
  const full = `${first} ${last}`.trim();
  return full.length > 0 ? full : 'Customer';
}

function utcWeekStart(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
}

function encodeCursor(row: SearchedVendorRow): string {
  const payload: DecodedCursor = {
    rating: row.rating,
    ratingCount: row.rating_count,
    distance: row.distance_km,
    id: row.id,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(s: string | undefined): DecodedCursor | null {
  if (!s) return null;
  try {
    const json = Buffer.from(s, 'base64url').toString('utf8');
    const obj = JSON.parse(json) as Partial<DecodedCursor>;
    if (
      typeof obj.rating !== 'number' ||
      typeof obj.ratingCount !== 'number' ||
      typeof obj.id !== 'string'
    ) {
      return null;
    }
    return {
      rating: obj.rating,
      ratingCount: obj.ratingCount,
      distance: typeof obj.distance === 'number' ? obj.distance : null,
      id: obj.id,
    };
  } catch {
    return null;
  }
}

/**
 * Allowed status transitions and which roles may perform each, per the
 * security spec (Step 5):
 *   approved      → compliance or admin (compliance signs off the docs;
 *                    admin can override).
 *   live          → admin only (post-menu-review go-live decision).
 *   suspended     → admin or compliance (either can pull a vendor offline).
 *   probation     → admin only.
 *   removed       → admin only.
 */
const TRANSITIONS: Record<VendorStatus, Partial<Record<VendorStatus, UserRole[]>>> = {
  pending: {
    approved: [UserRole.compliance, UserRole.admin],
    removed: [UserRole.admin],
  },
  approved: {
    live: [UserRole.admin],
    removed: [UserRole.admin],
  },
  live: {
    suspended: [UserRole.admin, UserRole.compliance],
    removed: [UserRole.admin],
  },
  suspended: {
    probation: [UserRole.admin],
    removed: [UserRole.admin],
  },
  probation: {
    live: [UserRole.admin],
    removed: [UserRole.admin],
  },
  removed: {},
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

interface PostcodeLatLng {
  latitude: number | null;
  longitude: number | null;
}

/**
 * Process-lifetime cache for postcodes.io lookups. Shared between requests
 * (and across VendorsService instances) so the customer-search hot path
 * doesn't re-hit the network for popular postcodes on every keystroke.
 * Misses are cached too so repeated invalid postcodes don't melt the API.
 */
const GEOCODE_CACHE = new Map<string, PostcodeLatLng>();

// Cache for radius-to-district lookups via postcodes.io /outcodes.
// Key: `${lat.toFixed(4)},${lng.toFixed(4)},${radiusMiles}`. TTL: 1 hour.
const DISTRICT_CACHE = new Map<string, { expires: number; districts: string[] }>();

async function fetchPostcodesIo(path: string, logger?: Logger): Promise<PostcodeLatLng> {
  try {
    const res = await fetch(`https://api.postcodes.io${path}`, {
      signal: AbortSignal.timeout(2_500),
    });
    if (!res.ok) return { latitude: null, longitude: null };
    const json = (await res.json()) as {
      result?: { latitude?: number; longitude?: number };
    };
    const lat = json.result?.latitude;
    const lng = json.result?.longitude;
    return {
      latitude: typeof lat === 'number' ? lat : null,
      longitude: typeof lng === 'number' ? lng : null,
    };
  } catch (e) {
    logger?.warn(`postcodes.io request failed for ${path}: ${(e as Error).message}`);
    return { latitude: null, longitude: null };
  }
}

/**
 * Great-circle distance in kilometres between two WGS-84 points (Earth radius
 * 6371km). Mirrors the SQL haversine used in vendor search so the customer
 * sees the same number whether they're looking at the list or the profile.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

async function geocodePostcode(raw: string, logger?: Logger): Promise<PostcodeLatLng> {
  const key = raw.replace(/\s+/g, '').toUpperCase();
  if (!key) return { latitude: null, longitude: null };
  const cached = GEOCODE_CACHE.get(key);
  if (cached) return cached;
  // Try the full-postcode endpoint first (handles "SE15 4ST"). If that
  // misses - or the caller passed an outward-only code like "SE15" - fall
  // back to /outcodes/<outward> which returns the district centroid. The
  // centroid is plenty accurate for the customer-search "in your area" UX.
  let out = await fetchPostcodesIo(`/postcodes/${encodeURIComponent(key)}`, logger);
  if (out.latitude === null || out.longitude === null) {
    const outward = key.match(/^[A-Z]{1,2}[0-9][A-Z0-9]?/)?.[0];
    if (outward) {
      out = await fetchPostcodesIo(`/outcodes/${encodeURIComponent(outward)}`, logger);
    }
  }
  GEOCODE_CACHE.set(key, out);
  return out;
}

/**
 * Build a legacy free-text collectionAddress from the new structured fields
 * so that existing order-display code (which reads collectionAddress) keeps
 * working after the UI switches to the structured form.
 */
function buildLegacyCollectionAddress(dto: {
  collectionLine1?: string;
  collectionLine2?: string;
  collectionTown?: string;
  collectionPostcode?: string;
}): string | null {
  const parts = [
    dto.collectionLine1,
    dto.collectionLine2,
    dto.collectionTown,
    dto.collectionPostcode,
  ]
    .map((p) => p?.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Pull a UK postcode out of a free-form collection address. Matches the
 * standard outward+inward shape (e.g. "SE15 4ST", "SW1A 1AA"). Returns the
 * canonicalised "OUT IN" form so callers can hand it straight to postcodes.io.
 */
function extractPostcodeFromAddress(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const m = addr.toUpperCase().match(/([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})/);
  return m ? `${m[1]} ${m[2]}` : null;
}

/**
 * Best-effort postcode for geocoding a vendor's local-delivery centre.
 * Prefers the first servicing postcode (those tend to be outward-only and
 * map cleanly), then falls back to anything we can dig out of the
 * collection address. Returns null if nothing usable is available - the
 * caller persists null lat/lng and the search just won't include this
 * vendor in radius results until a vendor edits their delivery config.
 */
export function pickGeocodingPostcode(input: {
  postcodes?: string[] | null;
  collectionAddress?: string | null;
}): string | null {
  const first = input.postcodes?.find((p) => p && p.trim().length > 0);
  if (first) return first.trim();
  return extractPostcodeFromAddress(input.collectionAddress ?? null);
}

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);
  constructor(
    private readonly repo: VendorRepository,
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly config: ConfigService,
    private readonly cache: RedisCacheService,
    // NotificationsModule is @Global() so no module import needed here.
    private readonly notifications: NotificationsService,
    private readonly email: EmailProvider,
    // T005: identity image uploads (logo/cover). SupabaseStorageService is
    // provided by CatalogueModule, which VendorsModule now imports.
    private readonly storage: SupabaseStorageService,
    // T010: server-side RBAC. Every "me" endpoint resolves the caller's
    // vendor through this so team members (kitchen manager, finance,
    // staff, delivery coordinator) can act on their team's vendor as
    // their role allows, not just the original owner.
    private readonly members: VendorMembersService,
    // Notifications queue for durable retry of vendor-application emails.
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * T010: resolve the caller's vendor row and assert their effective
   * role is in `allowed`. Owner of a vendor always passes implicitly;
   * active VendorMembers pass iff their role is in the allow-list.
   * Throws ForbiddenException (NOT_VENDOR_MEMBER / VENDOR_ROLE_FORBIDDEN)
   * if not. Replaces the older `repo.findByUserId(userId)` pattern that
   * silently 404'd for team members.
   */
  private async resolveMyVendor(userId: string, allowed: VendorMemberRole[]) {
    const { vendorId } = await this.members.resolveVendorIdByUserId(userId, allowed);
    const vendor = await this.repo.findById(vendorId);
    if (!vendor) {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'No vendor profile' });
    }
    return vendor;
  }

  /**
   * Public vendor application capture. Persists the row first (source of
   * truth for the admin queue), then fires admin + applicant emails as
   * best-effort side effects. Email failures are logged but NEVER fail
   * the HTTP request - the row is already saved, so the lead is never lost.
   *
   * No auth: this is a pre-account form. Anyone can POST. Length-bounded
   * DTO + Prisma column lengths cap abuse vectors; we deliberately don't
   * dedupe by email here so an applicant who fat-fingers the kitchen name
   * can re-submit. The admin queue surfaces same-email duplicates naturally.
   */
  async registerInterest(dto: RegisterVendorInterestDto, fpRef?: string) {
    const normalisedEmail = dto.email.trim().toLowerCase();

    // Resolve the referring vendor from the fp_ref cookie forwarded by the
    // web app as the X-Fp-Ref header. The cookie format is
    // "<referralLinkId>|<clickId>|<timestampMs>"; we need only the first
    // segment. Resolution happens here at submission time so the referral
    // survives until approval (which may be days later in an admin session).
    let referrerVendorId: string | null = null;
    if (fpRef) {
      const referralLinkId = fpRef.split('|')[0]?.trim();
      if (referralLinkId) {
        try {
          const link = await this.prisma.vendorReferralLink.findUnique({
            where: { id: referralLinkId },
            select: {
              vendorId: true,
              vendor: { select: { user: { select: { email: true } } } },
            },
          });
          if (link) {
            // Self-referral guard: reject if the referral link belongs to a
            // vendor whose owner has the same email as this applicant.
            if (link.vendor.user.email.toLowerCase() === normalisedEmail) {
              this.logger.warn(
                `registerInterest: self-referral detected for email=${normalisedEmail}, referralLinkId=${referralLinkId} - referrerVendorId not stored`,
              );
            } else {
              referrerVendorId = link.vendorId;
            }
          }
          // Unknown slug/link ID: leave referrerVendorId null (not an error -
          // the link may have been deleted or the cookie value may be stale).
        } catch (err) {
          // Never block an application submission over a referral lookup failure.
          this.logger.error(
            `registerInterest: referral link lookup failed for referralLinkId=${referralLinkId}: ${(err as Error).message} - proceeding without referrerVendorId`,
          );
        }
      }
    }

    const application = await this.prisma.vendorApplication.create({
      data: {
        fullName: dto.fullName.trim(),
        kitchenName: dto.kitchenName.trim(),
        email: normalisedEmail,
        phone: dto.phone.trim(),
        postcode: dto.postcode.trim().toUpperCase(),
        cuisineType: dto.cuisineType,
        kitchenType: dto.kitchenType,
        hasFsaRegistration: dto.hasFoodHygieneRegistration,
        hygieneRegNumber: dto.hygieneRegNumber.trim(),
        deliveryRadiusMiles: dto.deliveryRadiusMiles ?? null,
        orderTypes: dto.orderTypes ?? [],
        foodStory: dto.foodStory.trim(),
        instagram: dto.instagram?.trim().replace(/^@/, '') || null,
        marketingConsent: dto.marketingConsent ?? true,
        // Vendor T&Cs acceptance audit. Server timestamp the moment the
        // payload arrived as a fallback for older clients that omit the
        // field, so we never persist a row with NULL accepted_terms_at
        // for a NEW application going forward.
        acceptedTermsAt: dto.acceptedTermsAt ? new Date(dto.acceptedTermsAt) : new Date(),
        // Trim then fall back: a malformed client sending "" or "   " must
        // not persist a blank version string - we want the current default
        // so legal can correlate the row against the right T&Cs revision.
        acceptedTermsVersion: dto.acceptedTermsVersion?.trim() || '2026-05',
        // Referral attribution: written once, never overwritten.
        referrerVendorId,
      },
      select: { id: true, kitchenName: true, createdAt: true, status: true },
    });

    // Enqueue both emails as durable Bull jobs (3 attempts, exponential
    // backoff starting at 30 s). If Resend is down the job retries up to
    // 3 times before Sentry is paged by Bull's OnQueueFailed handler.
    // The application row is already persisted so the lead is never lost.
    const adminEmail =
      this.config.get<string>('VENDOR_APPLICATIONS_ADMIN_EMAIL') ?? 'soul@feastpot.co.uk';
    const adminBase = this.config.get<string>('ADMIN_URL') ?? 'https://admin.feastpot.co.uk';
    const firstName = dto.fullName.trim().split(/\s+/)[0] ?? 'there';

    const adminMsg = vendorApplicationReceivedTemplate({
      applicationId: application.id,
      fullName: dto.fullName.trim(),
      kitchenName: dto.kitchenName.trim(),
      email: normalisedEmail,
      phone: dto.phone.trim(),
      postcode: dto.postcode.trim().toUpperCase(),
      cuisineType: dto.cuisineType,
      kitchenType: dto.kitchenType,
      hasFsaRegistration: dto.hasFoodHygieneRegistration,
      hygieneRegNumber: dto.hygieneRegNumber.trim(),
      deliveryRadiusMiles: dto.deliveryRadiusMiles ?? null,
      orderTypes: dto.orderTypes ?? null,
      foodStory: dto.foodStory.trim(),
      instagram: dto.instagram?.trim().replace(/^@/, '') || null,
      adminUrl: `${adminBase}/vendor-applications/${application.id}`,
    });
    const applicantMsg = vendorApplicationAcknowledgedTemplate({
      firstName,
      kitchenName: dto.kitchenName.trim(),
    });

    const jobOpts = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 } as const,
      removeOnComplete: true,
    };
    await Promise.allSettled([
      this.queue.add(
        'vendor_application_email_raw',
        { to: adminEmail, subject: adminMsg.subject, html: adminMsg.html },
        { ...jobOpts, jobId: `vendor-app-admin-${application.id}` },
      ),
      this.queue.add(
        'vendor_application_email_raw',
        { to: normalisedEmail, subject: applicantMsg.subject, html: applicantMsg.html },
        { ...jobOpts, jobId: `vendor-app-applicant-${application.id}` },
      ),
    ]);

    return {
      id: application.id,
      status: application.status,
      kitchenName: application.kitchenName,
      createdAt: application.createdAt,
    };
  }

  // Cache TTLs are deliberately short - vendor data is not strictly
  // immutable (statuses change, ratings recompute via badge-recalc cron),
  // so we trade a small staleness window for a large hit-rate win on
  // browse-heavy traffic.
  private static readonly SEARCH_CACHE_TTL = 300; // 5 min
  private static readonly PROFILE_CACHE_TTL = 600; // 10 min

  // ------------------------------------------------------------------
  // Analytics, delivery-config and Stripe Connect - all gated to the
  // authenticated vendor's own profile via VendorRepository.findByUserId.
  // None of these expose a vendorId path param; the vendor is always
  // resolved from the JWT, which prevents IDOR-style cross-vendor reads.
  // ------------------------------------------------------------------

  async getMyAnalytics(userId: string): Promise<VendorAnalyticsResponseDto> {
    const vendor = await this.resolveMyVendor(userId, VENDOR_PAYOUT_ROLES);
    const vendorId = vendor.id;

    const now = new Date();
    const thisWeekStart = utcWeekStart(now);
    // 8-week window starts at the Monday 7 weeks before this one (inclusive).
    const eightWeekStart = new Date(thisWeekStart);
    eightWeekStart.setUTCDate(eightWeekStart.getUTCDate() - 7 * 7);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    // Three independent reads run in parallel.
    const [weeklyOrders, hourlyOrders, topItems, aov] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          vendorId,
          status: { in: REVENUE_STATUSES_LIST },
          createdAt: { gte: eightWeekStart },
        },
        select: { totalPence: true, vendorPayoutPence: true, createdAt: true },
      }),
      this.prisma.order.findMany({
        where: { vendorId, createdAt: { gte: ninetyDaysAgo } },
        select: { createdAt: true },
      }),
      // Top dishes: aggregate orderItems for revenue-counting orders in last 90d.
      this.prisma.orderItem.groupBy({
        by: ['menuItemId'],
        where: {
          order: {
            vendorId,
            status: { in: REVENUE_STATUSES_LIST },
            createdAt: { gte: ninetyDaysAgo },
          },
        },
        _sum: { quantity: true, totalPence: true },
        _count: { _all: true },
        orderBy: { _sum: { totalPence: 'desc' } },
        take: 10,
      }),
      this.prisma.order.aggregate({
        where: {
          vendorId,
          status: { in: REVENUE_STATUSES_LIST },
          createdAt: { gte: ninetyDaysAgo },
        },
        _avg: { totalPence: true },
      }),
    ]);

    // Bucket weekly orders into 8 ISO-week slots (oldest→newest).
    const weeklyMap = new Map<string, WeeklyRevenueBucketDto>();
    for (let i = 0; i < 8; i += 1) {
      const ws = new Date(eightWeekStart);
      ws.setUTCDate(ws.getUTCDate() + i * 7);
      weeklyMap.set(ws.toISOString(), {
        weekStart: ws.toISOString(),
        ordersCount: 0,
        revenuePence: 0,
      });
    }
    for (const o of weeklyOrders) {
      const key = utcWeekStart(o.createdAt).toISOString();
      const bucket = weeklyMap.get(key);
      if (!bucket) continue;
      bucket.ordersCount += 1;
      // Use vendor payout (net of commission) so the vendor sees what they earned.
      bucket.revenuePence += o.vendorPayoutPence;
    }
    const weeklyRevenue = Array.from(weeklyMap.values());

    // Bucket hourly into 24 slots.
    const hourly: HourlyOrdersBucketDto[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      ordersCount: 0,
    }));
    for (const o of hourlyOrders) hourly[o.createdAt.getUTCHours()]!.ordersCount += 1;

    // Resolve menu item names for the top dishes (single batched read).
    const itemIds = topItems.map((t) => t.menuItemId).filter((x): x is string => !!x);
    const items = itemIds.length
      ? await this.prisma.menuItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(items.map((i) => [i.id, i.name]));
    const topDishes: TopDishDto[] = topItems
      .filter((t): t is typeof t & { menuItemId: string } => !!t.menuItemId)
      .map((t) => ({
        menuItemId: t.menuItemId,
        name: nameById.get(t.menuItemId) ?? 'Deleted item',
        ordersCount: t._count._all,
        unitsSold: t._sum.quantity ?? 0,
        revenuePence: t._sum.totalPence ?? 0,
      }));

    return {
      weeklyRevenue,
      topDishes,
      hourlyDistribution: hourly,
      averageOrderValuePence: Math.round(aov._avg.totalPence ?? 0),
      reorderRatePct: vendor.reorderRatePct,
    };
  }

  async getMyDeliveryConfig(userId: string) {
    const vendor = await this.resolveMyVendor(userId, VENDOR_READ_ROLES);
    return this.prisma.deliveryConfig.findUnique({ where: { vendorId: vendor.id } });
  }

  async upsertMyDeliveryConfig(userId: string, dto: UpsertDeliveryConfigDto) {
    const vendor = await this.resolveMyVendor(userId, VENDOR_PROFILE_WRITE_ROLES);

    // Geocode the vendor's local-delivery centre so the customer-facing
    // search can match by real distance instead of relying on the legacy
    // outward-postcode-prefix proxy. Best-effort: if postcodes.io is down
    // or the postcode is unrecognised we still persist the rest of the
    // config (lat/lng = NULL) - vendors must never be blocked from
    // editing their delivery settings by a flaky third party.
    const existing = vendor.deliveryConfig;

    // kitchenPostcode is the preferred geocoding anchor. Fall back to the
    // legacy pickGeocodingPostcode helper only when it is absent.
    const kitchenPostcode =
      dto.kitchenPostcode !== undefined
        ? dto.kitchenPostcode || null
        : (existing?.kitchenPostcode ?? null);
    const geocodeTarget =
      kitchenPostcode ||
      pickGeocodingPostcode({
        postcodes: dto.postcodes ?? existing?.postcodes ?? [],
        collectionAddress:
          dto.collectionAddress !== undefined
            ? dto.collectionAddress
            : (existing?.collectionAddress ?? null),
      });

    // Decide whether the geo-driving fields actually changed in this request.
    // If they did, the new coords (even nulls) replace the old ones - the
    // vendor explicitly moved. If they didn't, we treat a geocode miss as a
    // transient postcodes.io failure and KEEP the existing coordinates so a
    // vendor toggling a non-location field during an outage cannot silently
    // wipe their on-map position.
    const geoInputsChanged =
      (dto.kitchenPostcode !== undefined &&
        (dto.kitchenPostcode || null) !== (existing?.kitchenPostcode ?? null)) ||
      (dto.postcodes !== undefined &&
        JSON.stringify(dto.postcodes) !== JSON.stringify(existing?.postcodes ?? [])) ||
      (dto.collectionAddress !== undefined &&
        (dto.collectionAddress ?? null) !== (existing?.collectionAddress ?? null));

    const fresh: PostcodeLatLng = geocodeTarget
      ? await geocodePostcode(geocodeTarget, this.logger)
      : { latitude: null, longitude: null };
    const coords: PostcodeLatLng =
      geoInputsChanged || !existing || existing.latitude == null || existing.longitude == null
        ? fresh
        : fresh.latitude != null && fresh.longitude != null
          ? fresh
          : { latitude: existing.latitude, longitude: existing.longitude };

    const result = await this.prisma.deliveryConfig.upsert({
      where: { vendorId: vendor.id },
      create: {
        vendorId: vendor.id,
        types: dto.types,
        localRadiusMiles: dto.localRadiusMiles ?? 5,
        localFeePence: dto.localFeePence ?? 0,
        collectionAddress: dto.collectionAddress ?? buildLegacyCollectionAddress(dto) ?? null,
        nationwideEnabled: dto.nationwideEnabled ?? false,
        nationwideFeePence: dto.nationwideFeePence ?? 0,
        minOrderPence: dto.minOrderPence ?? 0,
        freeDeliveryOverPence: dto.freeDeliveryOverPence ?? null,
        postcodes: dto.postcodes ?? [],
        kitchenPostcode: kitchenPostcode,
        collectionLine1: dto.collectionLine1 ?? null,
        collectionLine2: dto.collectionLine2 ?? null,
        collectionTown: dto.collectionTown ?? null,
        collectionPostcode: dto.collectionPostcode ?? null,
        latitude: coords.latitude,
        longitude: coords.longitude,
      },
      update: {
        types: dto.types,
        ...(dto.localRadiusMiles !== undefined ? { localRadiusMiles: dto.localRadiusMiles } : {}),
        ...(dto.localFeePence !== undefined ? { localFeePence: dto.localFeePence } : {}),
        // Keep the legacy free-text field in sync so existing order-display
        // code that reads collectionAddress continues to work.
        ...(dto.collectionAddress !== undefined || dto.collectionLine1 !== undefined
          ? {
              collectionAddress:
                dto.collectionAddress ??
                buildLegacyCollectionAddress(dto) ??
                existing?.collectionAddress ??
                null,
            }
          : {}),
        ...(dto.nationwideEnabled !== undefined
          ? { nationwideEnabled: dto.nationwideEnabled }
          : {}),
        ...(dto.nationwideFeePence !== undefined
          ? { nationwideFeePence: dto.nationwideFeePence }
          : {}),
        ...(dto.minOrderPence !== undefined ? { minOrderPence: dto.minOrderPence } : {}),
        ...(dto.freeDeliveryOverPence !== undefined
          ? { freeDeliveryOverPence: dto.freeDeliveryOverPence }
          : {}),
        ...(dto.postcodes !== undefined ? { postcodes: dto.postcodes } : {}),
        ...(kitchenPostcode !== (existing?.kitchenPostcode ?? null) ? { kitchenPostcode } : {}),
        ...(dto.collectionLine1 !== undefined
          ? { collectionLine1: dto.collectionLine1 ?? null }
          : {}),
        ...(dto.collectionLine2 !== undefined
          ? { collectionLine2: dto.collectionLine2 ?? null }
          : {}),
        ...(dto.collectionTown !== undefined ? { collectionTown: dto.collectionTown ?? null } : {}),
        ...(dto.collectionPostcode !== undefined
          ? { collectionPostcode: dto.collectionPostcode ?? null }
          : {}),
        // Always persist the freshly-computed coords so a vendor wiping their
        // service area visibly disables radius matching rather than leaving a
        // stale point on the map.
        latitude: coords.latitude,
        longitude: coords.longitude,
      },
    });

    // Search results embed delivery radius hits - invalidate so the next
    // search reflects the new coordinates immediately.
    await this.cache.delByPattern('vendors:search:*');

    return result;
  }

  /**
   * Return all UK postcode districts whose centroid falls within
   * `radiusMiles` of the given point. Uses the postcodes.io /outcodes
   * radius endpoint (free, no API key, offline-capable after first hit via
   * the in-process DISTRICT_CACHE).
   *
   * On failure (postcodes.io unreachable) returns an empty list with no
   * exception so the UI can explain the situation rather than show a 500.
   */
  async computeDeliveryDistricts(
    lat: number,
    lng: number,
    radiusMiles: number,
  ): Promise<{ districts: string[] }> {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)},${radiusMiles}`;
    const cached = DISTRICT_CACHE.get(key);
    if (cached && cached.expires > Date.now()) return { districts: cached.districts };

    const radiusMeters = Math.round(radiusMiles * 1609.344);
    try {
      const res = await fetch(
        `https://api.postcodes.io/outcodes?longitude=${lng}&latitude=${lat}&limit=200&radius=${radiusMeters}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!res.ok) return { districts: [] };
      const json = (await res.json()) as { result?: Array<{ outcode: string }> };
      const districts = (json.result ?? []).map((r) => r.outcode.toUpperCase()).sort();
      DISTRICT_CACHE.set(key, { expires: Date.now() + 60 * 60 * 1_000, districts });
      return { districts };
    } catch {
      return { districts: [] };
    }
  }

  /**
   * Lazy-create a Stripe Express account for this vendor (idempotent: if one
   * already exists on the Vendor row, we just refresh the onboarding link).
   * Returns the hosted onboarding URL.
   *
   * Failure modes:
   *   - STRIPE_SECRET_KEY missing → throws BadRequestException so the UI can
   *     show a friendly "payouts not configured" message instead of 500.
   *   - Stripe API errors → bubbled as BadRequestException with the original
   *     message (no retry; the vendor can re-click the button).
   */
  async createStripeConnectLink(userId: string): Promise<StripeConnectLinkResponseDto> {
    const vendor = await this.resolveMyVendor(userId, VENDOR_PROFILE_WRITE_ROLES);
    if (!this.config.get<string>('STRIPE_SECRET_KEY')) {
      throw new BadRequestException({
        code: 'STRIPE_NOT_CONFIGURED',
        message: 'Stripe is not configured on this environment yet',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user?.email) {
      throw new BadRequestException({
        code: 'USER_EMAIL_MISSING',
        message: 'User has no email on file',
      });
    }

    let accountId = vendor.stripeAccountId;
    if (!accountId) {
      try {
        const account = await this.stripe.createConnectAccount({
          email: user.email,
          vendorId: vendor.id,
        });
        accountId = account.id;
        await this.prisma.vendor.update({
          where: { id: vendor.id },
          data: { stripeAccountId: accountId },
        });
      } catch (e) {
        throw new BadRequestException({
          code: 'STRIPE_ACCOUNT_CREATE_FAILED',
          message: (e as Error).message,
        });
      }
    } else {
      // Pragmatic Stripe sync: every time the vendor opens the onboarding
      // link we re-read the account state from Stripe and persist
      // payoutsEnabled. This covers the "user finished onboarding and came
      // back" path without needing the full account.updated webhook (which
      // is still the right long-term solution but is out of scope here -
      // tracked in the summary).
      try {
        const account = await this.stripe.retrieveAccount(accountId);
        const enabled = (account.payouts_enabled ?? false) && (account.charges_enabled ?? false);
        if (enabled !== vendor.payoutsEnabled) {
          await this.prisma.vendor.update({
            where: { id: vendor.id },
            data: { payoutsEnabled: enabled },
          });
          // Profile cache embeds payoutsEnabled; bust it so the vendor
          // dashboard reflects onboarding completion immediately.
          await this.cache.del(`vendors:profile:${vendor.id}`);
        }
      } catch {
        // Non-fatal - surface the onboarding URL even if status sync fails.
      }
    }

    // Use the vendor portal URL the request came from. We can't rely on the
    // Origin header here (this runs server-side); fall back to a configured
    // env var, then a sensible localhost default for dev.
    const portalBase = this.config.get<string>('VENDOR_PORTAL_URL') ?? 'http://localhost:3002';
    try {
      const link = await this.stripe.createOnboardingLink({
        accountId,
        refreshUrl: `${portalBase}/onboarding?stripe=refresh`,
        returnUrl: `${portalBase}/onboarding?stripe=return`,
      });
      return { url: link.url, accountId };
    } catch (e) {
      throw new BadRequestException({
        code: 'STRIPE_LINK_FAILED',
        message: (e as Error).message,
      });
    }
  }

  /**
   * Aggregated stats for the vendor's dashboard. Three Prisma queries run in
   * parallel: today's bucket, this week's bucket, and a pending-now count.
   *
   * "Today" and "this week" are computed from server-local UTC midnight /
   * Monday respectively - close enough for a vendor dashboard, and avoids
   * needing the vendor's TZ. We intentionally exclude cancelled/refunded
   * orders from revenue (a refunded order has zero net revenue for the
   * vendor) by filtering on a positive-status whitelist.
   */
  async getMyStats(userId: string): Promise<VendorStatsResponseDto> {
    const vendor = await this.resolveMyVendor(userId, VENDOR_READ_ROLES);
    const vendorId = vendor.id;

    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    // ISO week starts Monday. getUTCDay(): Sun=0..Sat=6 → shift to Mon=0..Sun=6.
    const dow = (now.getUTCDay() + 6) % 7;
    const weekStart = new Date(todayStart.getTime() - dow * 24 * 60 * 60 * 1000);

    const REVENUE_STATUSES = [
      OrderStatus.accepted,
      OrderStatus.preparing,
      OrderStatus.dispatched,
      OrderStatus.delivered,
    ];

    const [todayAgg, weekAgg, pendingNow] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          vendorId,
          createdAt: { gte: todayStart },
          status: { in: REVENUE_STATUSES },
        },
        _count: { _all: true },
        _sum: { totalPence: true },
      }),
      this.prisma.order.aggregate({
        where: {
          vendorId,
          createdAt: { gte: weekStart },
          status: { in: REVENUE_STATUSES },
        },
        _count: { _all: true },
        _sum: { totalPence: true },
      }),
      this.prisma.order.count({
        where: { vendorId, status: OrderStatus.pending },
      }),
    ]);

    return {
      today: {
        orders: todayAgg._count._all,
        revenuePence: todayAgg._sum.totalPence ?? 0,
      },
      week: {
        orders: weekAgg._count._all,
        revenuePence: weekAgg._sum.totalPence ?? 0,
      },
      pendingNow,
    };
  }

  /**
   * Single aggregated payload backing the dashboard's "what needs my attention
   * today" panels (T004). One round-trip so the home screen paints in one
   * shot instead of fanning out four parallel hooks. Pure read; no caching
   * because most rows are small and several change as the vendor works.
   */
  async getMyDashboardSummary(userId: string): Promise<VendorDashboardResponseDto> {
    const vendor = await this.resolveMyVendor(userId, VENDOR_READ_ROLES);
    const vendorId = vendor.id;

    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    // Upcoming window = 7 full days starting tomorrow (excludes today, which
    // is rendered in ordersDueToday). End-bound is exclusive.
    const weekEnd = new Date(tomorrowStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const ACTIVE_FULFILMENT: OrderStatus[] = [
      OrderStatus.accepted,
      OrderStatus.needs_clarification,
      OrderStatus.preparing,
      OrderStatus.ready,
      OrderStatus.dispatched,
    ];

    const [
      todayOrders,
      upcomingOrders,
      pendingEnquiriesCount,
      nextEnquiry,
      nextPayout,
      menuItemsAll,
    ] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          vendorId,
          status: { in: ACTIVE_FULFILMENT },
          scheduledFor: { gte: todayStart, lt: tomorrowStart },
        },
        orderBy: { scheduledFor: 'asc' },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          deliveryType: true,
          scheduledFor: true,
          totalPence: true,
          customer: { select: { firstName: true, lastName: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.findMany({
        where: {
          vendorId,
          status: { in: ACTIVE_FULFILMENT },
          scheduledFor: { gte: tomorrowStart, lt: weekEnd },
        },
        orderBy: { scheduledFor: 'asc' },
        take: 6,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          scheduledFor: true,
          totalPence: true,
          customer: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.eventEnquiry.count({
        where: {
          status: 'open',
          matchedVendorIds: { has: vendorId },
          quotes: { none: { vendorId } },
        },
      }),
      this.prisma.eventEnquiry.findFirst({
        where: {
          status: 'open',
          matchedVendorIds: { has: vendorId },
          quotes: { none: { vendorId } },
          eventDate: { gte: now },
        },
        orderBy: { eventDate: 'asc' },
        select: { eventDate: true },
      }),
      this.prisma.payout.findFirst({
        where: {
          vendorId,
          status: { in: ['draft', 'held', 'approved'] },
        },
        orderBy: [{ status: 'desc' }, { periodEnd: 'asc' }, { createdAt: 'asc' }],
        select: {
          status: true,
          amountPence: true,
          periodEnd: true,
          orderCount: true,
        },
      }),
      this.prisma.menuItem.findMany({
        where: { vendorId, isAvailable: true },
        select: { id: true, name: true, imageUrls: true, allergens: true },
      }),
    ]);

    const ordersDueToday = todayOrders.map((o) => ({
      id: o.id,
      code: o.orderNumber,
      customerName: formatCustomerName(o.customer),
      status: o.status,
      deliveryType: o.deliveryType,
      scheduledFor: o.scheduledFor ? o.scheduledFor.toISOString() : null,
      itemCount: o._count.items,
      totalPence: o.totalPence,
    }));

    const upcomingOrdersDto = upcomingOrders.map((o) => ({
      id: o.id,
      code: o.orderNumber,
      customerName: formatCustomerName(o.customer),
      status: o.status,
      scheduledFor: o.scheduledFor ? o.scheduledFor.toISOString() : null,
      totalPence: o.totalPence,
    }));

    const warningItems = menuItemsAll
      .map((m) => {
        const issues: Array<'no_image' | 'no_allergens'> = [];
        if (!m.imageUrls || m.imageUrls.length === 0) issues.push('no_image');
        if (!m.allergens || m.allergens.length === 0) issues.push('no_allergens');
        return issues.length ? { id: m.id, name: m.name, issues } : null;
      })
      .filter(
        (x): x is { id: string; name: string; issues: Array<'no_image' | 'no_allergens'> } =>
          x !== null,
      );

    const missingImages = warningItems.filter((i) => i.issues.includes('no_image')).length;
    const missingAllergens = warningItems.filter((i) => i.issues.includes('no_allergens')).length;

    const payoutDto = nextPayout
      ? {
          expectedDate: nextPayout.periodEnd ? nextPayout.periodEnd.toISOString() : null,
          amountPence: nextPayout.amountPence,
          state:
            nextPayout.status === 'approved'
              ? ('approved' as const)
              : nextPayout.status === 'held'
                ? ('pending_approval' as const)
                : ('accruing' as const),
          orderCount: nextPayout.orderCount,
        }
      : null;

    return {
      ordersDueToday,
      upcomingOrders: upcomingOrdersDto,
      eventEnquiries: {
        pending: pendingEnquiriesCount,
        nextEventDate: nextEnquiry?.eventDate ? nextEnquiry.eventDate.toISOString() : null,
      },
      nextPayout: payoutDto,
      menuHealth: {
        missingImages,
        missingAllergens,
        items: warningItems.slice(0, 5),
      },
    };
  }

  async search(dto: SearchVendorsDto) {
    const limit = dto.limit ?? 20;
    // Cache key includes the entire DTO so each filter combo is its own
    // bucket. Logged search rows are intentionally written below on EVERY
    // call (including cache hits) so the analytics pipeline still sees
    // real customer demand even when the response was served from Redis.
    const cacheKey = `vendors:search:${RedisCacheService.stableKey(dto)}`;
    const cached = await this.cache.get<{
      data: ReturnType<VendorsService['mapSearchRows']>;
      nextCursor: string | null;
    }>(cacheKey);
    if (cached) {
      this.logSearchAnonymously(dto, cached.data.length);
      return cached;
    }

    const cursor = decodeCursor(dto.cursor);
    // Geocode the requesting postcode once per search so the repo can do
    // real haversine distance against each vendor's delivery-config
    // coordinates instead of falling back to the legacy outward-prefix
    // proxy. A miss returns nulls and the repo gracefully degrades.
    const userCoords = dto.postcode
      ? await geocodePostcode(dto.postcode, this.logger)
      : { latitude: null, longitude: null };
    const rows = await this.repo.search(dto, cursor, userCoords);
    const nextCursor = rows.length === limit ? encodeCursor(rows[rows.length - 1]!) : null;

    this.logSearchAnonymously(dto, rows.length);

    const result = { data: this.mapSearchRows(rows), nextCursor };
    await this.cache.set(cacheKey, result, VendorsService.SEARCH_CACHE_TTL);
    return result;
  }

  private mapSearchRows(rows: SearchedVendorRow[]) {
    return rows.map((r) => ({
      id: r.id,
      businessName: r.business_name,
      slug: r.slug,
      description: r.description,
      cuisines: r.cuisines,
      status: r.status,
      rating: r.rating,
      ratingCount: r.rating_count,
      createdAt: r.created_at,
      distanceKm: r.distance_km,
      // Empty array (not null) so the client can `.length` without a guard.
      matchedDishes: r.matched_dishes ?? [],
    }));
  }

  /**
   * FR-SRCH-001: log every free-text search anonymously. Fire-and-forget -
   * logging must never slow down the response or fail the request. Only
   * log when the user actually typed something (avoids polluting the
   * analytics table with empty pass-throughs from the cuisine carousel).
   */
  private logSearchAnonymously(dto: SearchVendorsDto, resultsCount: number): void {
    const q = dto.q?.trim();
    if (!q) return;
    // Skip keystroke fragments. Queries shorter than 3 characters are
    // incomplete and inflate trend counts with noise ("P", "Pu", etc.).
    // The matching guard in VendorSearchBar/VendorSearchInput prevents the
    // debounced URL update for short queries, so the search endpoint is
    // unlikely to be called with them, but this is a belt-and-suspenders
    // check that also covers direct API callers.
    if (q.length < 3) return;
    void this.prisma.searchLog
      .create({
        data: {
          query: q.slice(0, 200),
          postcode: dto.postcode?.slice(0, 10) ?? null,
          resultsCount,
        },
      })
      .catch(() => {
        /* analytics is non-critical - swallow */
      });
  }

  async findById(id: string) {
    const cacheKey = `vendors:profile:${id}`;
    const cached =
      await this.cache.get<Awaited<ReturnType<VendorRepository['findById']>>>(cacheKey);
    if (cached) return cached;

    const vendor = await this.repo.findById(id);
    if (!vendor)
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
    await this.cache.set(cacheKey, vendor, VendorsService.PROFILE_CACHE_TTL);
    return vendor;
  }

  /**
   * Slug → public profile lookup. Used by the customer PWA which addresses
   * vendors by `/vendors/<slug>` rather than UUID. Two-hop (`findBySlug`
   * for the id, then `findById` for the full payload) so the response
   * shape stays identical to GET /v1/vendors/:id without us having to
   * duplicate the Prisma include tree across two repository methods.
   *
   * SECURITY: this is a public, unauthenticated route addressed by
   * human-readable slug, which is trivially guessable. We therefore return
   * 404 for anything not in `live` status - pending/suspended/draft vendor
   * profiles must NOT be enumerable from the customer-facing surface. Use
   * the UUID `:id` route (admin/vendor surfaces) for non-live access.
   *
   * `postcode` is an optional customer postcode used to attach a real
   * great-circle `distanceKm` to the response so the profile page can show
   * "X.X mi away" - matching the surfacing already provided on the search
   * list. Distance is computed in JS off the (cached) findById payload, so
   * it never pollutes the profile cache and gracefully degrades to null
   * when either the postcode geocode misses or the vendor has no
   * delivery-config coordinates.
   */
  async findBySlug(slug: string, postcode?: string) {
    const lite = await this.repo.findBySlug(slug);
    if (!lite || lite.status !== 'live') {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
    }
    const vendor = await this.findById(lite.id);
    // Platform service fee (bps) is global and read from env at REQUEST time,
    // not from the cached profile, so the customer PWA's express-checkout total
    // stays in lockstep with what orders.service charges if the fee changes.
    const platformServiceFeeBps = getServiceFeeBps();
    // Real per-star counts for the profile's rating bars. Computed fresh
    // (not from the profile cache) so a just-published review moves the bars
    // in lockstep with the recalculated headline rating.
    const ratingBreakdown = await this.getRatingBreakdown(lite.id);
    // Resolve featured dish IDs to names. Items that have since been deleted
    // or taken offline are excluded automatically (self-heal on every read).
    const featuredDishDetails =
      vendor.featuredDishes && vendor.featuredDishes.length > 0
        ? await this.prisma.menuItem.findMany({
            where: {
              id: { in: vendor.featuredDishes },
              vendorId: lite.id,
              isAvailable: true,
              moderationStatus: {
                in: [ModerationStatus.auto_approved, ModerationStatus.approved],
              },
            },
            select: { id: true, name: true },
          })
        : [];

    const base = { ...vendor, platformServiceFeeBps, ratingBreakdown, featuredDishDetails };
    const trimmed = postcode?.trim();
    if (!trimmed) return base;
    const dc = vendor.deliveryConfig;
    if (!dc || dc.latitude == null || dc.longitude == null) return base;
    const coords = await geocodePostcode(trimmed, this.logger);
    if (coords.latitude == null || coords.longitude == null) return base;
    const distanceKm = haversineKm(coords.latitude, coords.longitude, dc.latitude, dc.longitude);
    return { ...base, distanceKm };
  }

  /** Return the new slug if `slug` is an old address that was redirected. */
  async findSlugRedirect(slug: string): Promise<{ newSlug: string } | null> {
    const row = await this.repo.findSlugRedirect(slug);
    if (!row?.vendor?.slug) return null;
    return { newSlug: row.vendor.slug };
  }

  /** All live, approved menu items for a vendor. Used by the featured-dishes picker. */
  async getLiveMenuItems(
    vendorId: string,
  ): Promise<{ id: string; name: string; imageUrls: string[] }[]> {
    return this.prisma.menuItem.findMany({
      where: {
        vendorId,
        isAvailable: true,
        moderationStatus: { in: [ModerationStatus.auto_approved, ModerationStatus.approved] },
      },
      select: { id: true, name: true, imageUrls: true },
      orderBy: { name: 'asc' },
    });
  }

  async findMyVendor(userId: string) {
    return this.resolveMyVendor(userId, VENDOR_READ_ROLES);
  }

  /**
   * Onboarding checklist progress for the authed vendor. Drives the
   * /onboarding/welcome screen: five setup steps the vendor must finish
   * before compliance puts the kitchen live. Each flag is derived from
   * existing profile/relation state - there is no separate
   * `onboardingCompletedAt` column; completion is otherwise tracked via
   * `Vendor.status` (pending → live), which is what gates the welcome
   * screen redirect.
   */
  async getOnboardingProgress(userId: string) {
    // Resolve membership-aware (a user may be a team member, not the owner)
    // so this matches /vendors/me - querying by userId alone would 404 for
    // non-owner members who can still reach the dashboard + welcome screen.
    const { id: vendorId } = await this.resolveMyVendor(userId, VENDOR_READ_ROLES);
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      include: {
        documents: true,
        deliveryConfig: true,
      },
    });

    if (!vendor) {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
    }

    // Onboarding copy promises compliance review once the vendor has at
    // least 3 items live, so the menu step uses that same threshold (it
    // previously passed with a single available item, contradicting the UI).
    const menuItemCount = await this.prisma.menuItem.count({
      where: { vendorId, isAvailable: true },
    });

    const steps = {
      profileComplete: !!(vendor.description && vendor.logoUrl),
      documentsComplete: vendor.documents.length >= 4,
      stripeComplete: !!vendor.stripeAccountId && vendor.payoutsEnabled,
      menuComplete: menuItemCount >= 3,
      deliveryComplete: !!vendor.deliveryConfig?.latitude,
    };

    return {
      ...steps,
      menuItemCount,
      allComplete: Object.values(steps).every(Boolean),
      completedCount: Object.values(steps).filter(Boolean).length,
      totalSteps: 5,
    };
  }

  async create(user: AuthUser, dto: CreateVendorDto) {
    const existing = await this.repo.findByUserId(user.id);
    if (existing) {
      throw new ConflictException({
        code: 'VENDOR_EXISTS',
        message: 'A vendor profile already exists for this user',
      });
    }
    const baseSlug = slugify(dto.businessName) || `vendor-${user.id.slice(0, 8)}`;
    const slug = await this.uniqueSlug(baseSlug);
    return this.repo.create({
      user: { connect: { id: user.id } },
      businessName: dto.businessName,
      slug,
      description: dto.description ?? null,
      cuisines: dto.cuisineTypes,
      status: VendorStatus.pending,
    });
  }

  async update(vendorId: string, user: AuthUser, dto: UpdateVendorDto) {
    const vendor = await this.repo.findById(vendorId);
    if (!vendor)
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
    if (user.role !== UserRole.admin) {
      const allowed = await this.members.canActOnVendor(
        user.id,
        vendorId,
        VENDOR_PROFILE_WRITE_ROLES,
      );
      if (!allowed) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Cannot edit another vendor' });
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.businessName !== undefined) data.businessName = dto.businessName;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.cuisineTypes !== undefined) data.cuisines = dto.cuisineTypes;

    // T005 business-profile fields.
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    if (dto.coverImageUrl !== undefined) data.coverImageUrl = dto.coverImageUrl;
    if (dto.specialities !== undefined) data.specialities = dto.specialities;
    if (dto.vendorStory !== undefined) data.vendorStory = dto.vendorStory;
    if (dto.featuredDishes !== undefined) {
      if (dto.featuredDishes.length > 0) {
        const valid = await this.prisma.menuItem.findMany({
          where: { id: { in: dto.featuredDishes }, vendorId },
          select: { id: true },
        });
        const validIds = new Set(valid.map((m) => m.id));
        const bad = dto.featuredDishes.filter((id) => !validIds.has(id));
        if (bad.length > 0) {
          throw new BadRequestException({
            code: 'INVALID_FEATURED_DISH',
            message: `Featured dish IDs not found on this vendor: ${bad.join(', ')}`,
          });
        }
      }
      data.featuredDishes = dto.featuredDishes;
    }
    if (dto.socialLinks !== undefined) {
      // Validate every value is an http(s) URL before persisting, so the
      // customer page can render the entries directly without re-checking.
      // Use the WHATWG URL parser (not just a regex prefix) so malformed
      // values like "https://" or "http://?" are rejected.
      for (const [k, v] of Object.entries(dto.socialLinks)) {
        if (typeof v !== 'string') {
          throw new BadRequestException({
            code: 'INVALID_SOCIAL_LINK',
            message: `socialLinks.${k} must be a string`,
          });
        }
        let parsed: URL;
        try {
          parsed = new URL(v);
        } catch {
          throw new BadRequestException({
            code: 'INVALID_SOCIAL_LINK',
            message: `socialLinks.${k} must be a valid URL`,
          });
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new BadRequestException({
            code: 'INVALID_SOCIAL_LINK',
            message: `socialLinks.${k} must use http(s)`,
          });
        }
        if (!parsed.hostname || !parsed.hostname.includes('.')) {
          throw new BadRequestException({
            code: 'INVALID_SOCIAL_LINK',
            message: `socialLinks.${k} must have a valid hostname`,
          });
        }
      }
      data.socialLinks = dto.socialLinks;
    }

    // Slug change: must be unique (case-insensitive). Normalise to lowercase
    // before persisting so the unique DB index remains the authoritative
    // collision guard. Skip the check when unchanged so vendors can re-save
    // the form without colliding with themselves.
    if (dto.slug !== undefined) {
      const normalisedSlug = dto.slug.toLowerCase();
      if (normalisedSlug !== vendor.slug.toLowerCase()) {
        const existing = await this.repo.findBySlugInsensitive(normalisedSlug);
        if (existing && existing.id !== vendorId) {
          throw new ConflictException({
            code: 'SLUG_TAKEN',
            message: `Slug "${normalisedSlug}" is already in use`,
          });
        }
        // Write a permanent redirect from the old slug so existing QR codes
        // and shared links continue to resolve after the change.
        await this.repo.createSlugRedirect(vendorId, vendor.slug);
        data.slug = normalisedSlug;
      }
    }

    const updated = Object.keys(data).length ? await this.repo.update(vendorId, data) : vendor;

    if (dto.minOrderPence !== undefined) {
      await this.repo.upsertDeliveryConfigMinOrder(vendorId, dto.minOrderPence);
    }

    // Invalidate caches: the profile we just mutated, plus every cached
    // search result (any of which could now contain stale name/cuisine).
    // SCAN-based delByPattern is O(N) over the cache keyspace but vendor
    // edits are rare relative to reads, so the trade-off is correct.
    await this.cache.del(`vendors:profile:${vendorId}`);
    await this.cache.delByPattern('vendors:search:*');

    return updated;
  }

  /**
   * T005: persist a freshly-uploaded logo or cover URL straight back onto
   * the vendor row so the storefront re-renders without the client needing
   * a second PATCH. Re-uses the same ownership/admin guard as `update`.
   */
  async uploadIdentityImage(
    vendorId: string,
    user: AuthUser,
    kind: 'logo' | 'cover',
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ) {
    const vendor = await this.repo.findById(vendorId);
    if (!vendor)
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
    if (vendor.userId !== user.id && user.role !== UserRole.admin) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Cannot edit another vendor' });
    }
    const uploaded = await this.storage.uploadVendorImage({ vendorId, kind, file });
    await this.repo.update(
      vendorId,
      kind === 'logo' ? { logoUrl: uploaded.publicUrl } : { coverImageUrl: uploaded.publicUrl },
    );
    await this.cache.del(`vendors:profile:${vendorId}`);
    await this.cache.delByPattern('vendors:search:*');
    return uploaded;
  }

  async updateStatus(vendorId: string, dto: UpdateVendorStatusDto, actor: AuthUser) {
    const vendor = await this.repo.findById(vendorId);
    if (!vendor)
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });

    if (vendor.status === dto.status) {
      throw new BadRequestException({
        code: 'STATUS_UNCHANGED',
        message: `Vendor is already ${dto.status}`,
      });
    }

    const allowed = TRANSITIONS[vendor.status][dto.status];
    if (!allowed) {
      throw new BadRequestException({
        code: 'INVALID_TRANSITION',
        message: `Cannot transition vendor from ${vendor.status} to ${dto.status}`,
      });
    }
    if (!allowed.includes(actor.role)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN_TRANSITION',
        message: `Role ${actor.role} cannot transition vendor from ${vendor.status} to ${dto.status}`,
      });
    }

    // HMRC SI 2023/817: a vendor cannot go live without a complete tax profile.
    // This gate applies to both pending→live and approved→live transitions.
    if (dto.status === VendorStatus.live) {
      const taxProfile = await this.prisma.vendorTaxProfile.findUnique({
        where: { vendorId },
        select: {
          entityType: true,
          legalName: true,
          addressLine1: true,
          city: true,
          postcode: true,
          dateOfBirth: true,
          companyNumber: true,
          taxIdentifier: true,
        },
      });
      if (!isTaxProfileComplete(taxProfile)) {
        throw new BadRequestException({
          code: 'TAX_PROFILE_INCOMPLETE',
          message:
            'This vendor cannot go live until their tax information is complete. ' +
            'Required by the Platform Operators (Due Diligence and Reporting Requirements) Regulations 2023 (SI 2023/817).',
        });
      }
    }

    const result = await this.repo.transitionStatus({
      vendorId,
      fromStatus: vendor.status,
      toStatus: dto.status,
      actorUserId: actor.id,
      reasonCode: dto.reasonCode,
      notes: dto.notes,
      orderCapWeekly: dto.orderCapWeekly,
    });

    // Critical: a suspended/removed vendor must NOT remain visible in the
    // search cache for up to 5 min. Same for a vendor coming back online.
    await this.cache.del(`vendors:profile:${vendorId}`);
    await this.cache.delByPattern('vendors:search:*');

    // FR-NOTIF (D14): notify the vendor when they go live so they don't
    // have to poll the portal to discover approval. Fire only on the
    // pending/approved → live transition (the customer-facing go-live
    // event). Re-activations from suspended/probation aren't "approval"
    // and intentionally don't re-send this celebration email.
    if (
      dto.status === VendorStatus.live &&
      (vendor.status === VendorStatus.pending || vendor.status === VendorStatus.approved)
    ) {
      const detail = await this.prisma.vendor.findUnique({
        where: { id: vendorId },
        select: {
          businessName: true,
          user: { select: { id: true, firstName: true } },
        },
      });
      if (detail?.user) {
        await this.notifications.enqueue(
          'vendor_approved',
          {
            // Routes the email/push to the vendor's user via the resolver
            // in NotificationProcessor (resolveUserId reads userId first).
            userId: detail.user.id,
            vendorFirstName: detail.user.firstName ?? 'there',
            businessName: detail.businessName,
            portalUrl:
              this.config.get<string>('VENDOR_PORTAL_URL') ?? 'https://vendor.feastpot.co.uk',
            supportEmail: 'support@feastpot.co.uk',
          },
          // Dedupe so a double-click on the admin Approve button can't
          // double-send. The processor / BullMQ refuse a second job with
          // the same id while the original is in queue/active.
          { jobId: `vendor_approved:${vendorId}` },
        );
      }
    }

    return result;
  }

  /**
   * Update a vendor's FSA compliance status and rating details.
   *
   * Only admin and compliance roles may call this; the controller enforces
   * that via @Roles before this method is reached.
   *
   * Cache invalidation is immediate: a vendor promoted to RATED with a
   * rating >= 3 must appear in customer search straight away, and a vendor
   * whose rating has dropped below 3 must vanish immediately.
   */
  async updateCompliance(vendorId: string, dto: UpdateVendorComplianceDto): Promise<void> {
    const vendor = await this.repo.findById(vendorId);
    if (!vendor)
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });

    await this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        complianceStatus: dto.complianceStatus,
        // Explicit null-coalescing: omitted fields clear the column rather
        // than leaving a stale value from a previous inspection round.
        fsaHygieneRating: dto.fsaHygieneRating !== undefined ? dto.fsaHygieneRating : null,
        fsaRatingDate: dto.fsaRatingDate ? new Date(dto.fsaRatingDate) : null,
        fsaRegistrationNumber: dto.fsaRegistrationNumber ?? null,
        fhrsId: dto.fhrsId ?? null,
        fsaLastChecked: dto.fsaLastChecked ? new Date(dto.fsaLastChecked) : new Date(),
      },
    });

    // Flush search cache so the listing gate (compliance_status = RATED AND
    // fsa_hygiene_rating >= 3) reflects the new state on the next search.
    await this.cache.del(`vendors:profile:${vendorId}`);
    await this.cache.delByPattern('vendors:search:*');
  }

  async getVendorReviews(vendorId: string, pagination: CursorPaginationDto) {
    const limit = pagination.limit ?? 20;
    const reviews = await this.repo.listPublishedReviews(vendorId, limit, pagination.cursor);
    const nextCursor = reviews.length === limit ? reviews[reviews.length - 1]!.id : null;
    // Shape for the public surface: expose reviewer INITIALS only (never the
    // raw name fields) - matches the customer PWA's `VendorReview` contract.
    const data = reviews.map(({ customer, ...r }) => ({
      ...r,
      customerInitials:
        [customer?.firstName?.[0], customer?.lastName?.[0]]
          .filter(Boolean)
          .join('')
          .toUpperCase() || 'FP',
    }));
    return { data, nextCursor };
  }

  /**
   * Real per-star review counts for the public profile's rating-breakdown
   * bars. Same published-only predicate as recalculateVendorRating so the
   * bars always sum to the headline `ratingCount`.
   */
  private async getRatingBreakdown(
    vendorId: string,
  ): Promise<{ 1: number; 2: number; 3: number; 4: number; 5: number }> {
    const grouped = await this.prisma.review.groupBy({
      by: ['rating'],
      where: {
        vendorId,
        isHidden: false,
        moderationStatus: { in: [ModerationStatus.auto_approved, ModerationStatus.approved] },
      },
      _count: { _all: true },
    });
    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const g of grouped) {
      if (g.rating >= 1 && g.rating <= 5) {
        breakdown[g.rating as 1 | 2 | 3 | 4 | 5] = g._count._all;
      }
    }
    return breakdown;
  }

  /**
   * Aggregated live-vendor delivery coverage (postcode districts) for the
   * SEO landing pages, so marketing copy reflects actual coverage instead of
   * a hardcoded area list. Public + cheap: distinct postcode prefixes from
   * live vendors' delivery configs, optionally filtered by cuisine.
   */
  async getCoverage(cuisines?: string[]) {
    const configs = await this.prisma.deliveryConfig.findMany({
      where: {
        vendor: {
          status: VendorStatus.live,
          ...(cuisines && cuisines.length > 0 ? { cuisines: { hasSome: cuisines } } : {}),
        },
      },
      select: { postcodes: true },
    });
    const districts = new Set<string>();
    for (const c of configs) {
      for (const p of c.postcodes) {
        const norm = p.trim().toUpperCase();
        if (norm) districts.add(norm);
      }
    }
    return {
      vendorCount: configs.length,
      postcodeDistricts: Array.from(districts).sort(),
    };
  }

  private async uniqueSlug(base: string): Promise<string> {
    let candidate = base;
    let attempt = 0;
    while (await this.repo.findBySlug(candidate)) {
      attempt += 1;
      candidate = `${base}-${attempt}`;
      if (attempt > 50) {
        throw new ConflictException({
          code: 'SLUG_CONFLICT',
          message: 'Could not generate unique vendor slug',
        });
      }
    }
    return candidate;
  }

  /**
   * Diagnostic-only snapshot for /v1/vendors/debug. Gated to non-prod by
   * the controller. Returns a fixed shape - see VendorsController.debug
   * for the contract.
   *
   * The current Prisma schema has NO lat/lng on Vendor or DeliveryConfig
   * (only Address carries coordinates). So `hasCoordinates`,
   * `configsWithCoordinates`, and `vendorsInRadius` are intentionally
   * always false / 0 - that is exactly the signal this endpoint exists
   * to surface: when `vendorsWithNoLocation === liveVendorCount` and
   * `vendorsInRadius === 0`, the root cause is missing vendor
   * coordinates, not a query bug or a missing env var.
   */
  async getDebugInfo(postcode?: string) {
    const [liveVendors, deliveryConfigCount, configsWithCoordinates, liveVendorCount] =
      await Promise.all([
        this.prisma.vendor.findMany({
          where: { status: 'live' },
          select: {
            id: true,
            businessName: true,
            status: true,
            deliveryConfig: {
              select: { localRadiusMiles: true, latitude: true, longitude: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
        this.prisma.deliveryConfig.count(),
        this.prisma.deliveryConfig.count({
          where: { latitude: { not: null }, longitude: { not: null } },
        }),
        this.prisma.vendor.count({ where: { status: 'live' } }),
      ]);

    const sampleVendors = liveVendors.map((v) => ({
      id: v.id,
      businessName: v.businessName,
      status: v.status,
      hasDeliveryConfig: v.deliveryConfig !== null,
      hasCoordinates: v.deliveryConfig?.latitude != null && v.deliveryConfig?.longitude != null,
      deliveryRadiusMiles: v.deliveryConfig?.localRadiusMiles ?? null,
    }));

    const postcodeTest = postcode ? await this.runPostcodeTest(postcode) : null;

    const nextPublicApiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_PUBLIC_URL ?? null;

    return {
      liveVendorCount,
      deliveryConfigCount,
      configsWithCoordinates,
      sampleVendors,
      postcodeTest,
      apiUrlSetInEnv: nextPublicApiUrl !== null,
      nextPublicApiUrl,
    };
  }

  /**
   * Live diagnostic of the postcode → in-radius pipeline used by the
   * customer search. Hits the same postcodes.io path the real search uses
   * so the result reflects production behaviour rather than a hardcoded
   * sample map.
   */
  private async runPostcodeTest(rawPostcode: string) {
    const postcode = rawPostcode.trim().toUpperCase();
    const coords = await geocodePostcode(postcode, this.logger);
    const geocoded =
      coords.latitude != null && coords.longitude != null
        ? { lat: coords.latitude, lng: coords.longitude }
        : null;

    const vendorsWithNoLocation = await this.prisma.vendor.count({
      where: {
        status: 'live',
        OR: [
          { deliveryConfig: null },
          { deliveryConfig: { latitude: null } },
          { deliveryConfig: { longitude: null } },
        ],
      },
    });

    let vendorsInRadius = 0;
    if (geocoded) {
      // Reuse the production search path so this diagnostic actually
      // covers the customer flow (postcode-prefix proxy + radius filter).
      const rows = await this.repo.search(
        { postcode, limit: 100, status: VendorStatus.live } as SearchVendorsDto,
        null,
        { latitude: geocoded.lat, longitude: geocoded.lng },
      );
      vendorsInRadius = rows.length;
    }

    return {
      postcode,
      geocoded,
      vendorsInRadius,
      vendorsWithNoLocation,
    };
  }

  // ------------------------------------------------------------------
  // Availability & scheduling (T002)
  // ------------------------------------------------------------------

  /** The Vendor scheduling columns we expose through the availability API. */
  private static readonly AVAILABILITY_SELECT = {
    id: true,
    openingDays: true,
    slotOpenHour: true,
    slotCloseHour: true,
    prepLeadHours: true,
    maxOrdersPerDay: true,
    maxTraysPerDay: true,
    sameDayOrders: true,
    largeOrderLeadHours: true,
    largeOrderTrayThreshold: true,
    eventCateringManualQuote: true,
  } as const;

  /**
   * Authed-vendor view of their own scheduling + blackout dates.
   * Used by the vendor portal's /availability page.
   */
  async getMyAvailability(userId: string) {
    const vendor = await this.resolveMyVendor(userId, VENDOR_AVAILABILITY_ROLES);
    return this.getAvailabilityById(vendor.id);
  }

  /**
   * Public availability snapshot for the customer checkout date picker.
   * Returns scheduling fields + the list of blackout dates from today
   * forward (we don't need history, and trimming keeps the payload
   * small even for vendors who've been around for years).
   */
  async getAvailabilityById(vendorId: string) {
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: VendorsService.AVAILABILITY_SELECT,
    });
    if (!vendor) {
      throw new NotFoundException({ code: 'VENDOR_NOT_FOUND', message: 'Vendor not found' });
    }
    const today = new Date();
    const todayStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const blackoutRows = await this.prisma.blackoutDate.findMany({
      where: { vendorId, date: { gte: todayStart } },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, reason: true },
    });
    return {
      ...vendor,
      // Serialise the DATE column as YYYY-MM-DD so timezone drift
      // can't move it across midnight on the client.
      blackoutDates: blackoutRows.map((b) => ({
        id: b.id,
        date: formatIsoDate(b.date),
        reason: b.reason,
      })),
    };
  }

  async updateMyAvailability(userId: string, dto: UpdateAvailabilityDto) {
    const vendor = await this.resolveMyVendor(userId, VENDOR_AVAILABILITY_ROLES);
    if (
      dto.slotOpenHour !== undefined &&
      dto.slotCloseHour !== undefined &&
      dto.slotCloseHour <= dto.slotOpenHour
    ) {
      throw new BadRequestException({
        code: 'INVALID_SLOT_WINDOW',
        message: 'Slot close hour must be after slot open hour',
      });
    }
    if (dto.openingDays && dto.openingDays.length === 0) {
      throw new BadRequestException({
        code: 'NO_OPENING_DAYS',
        message: 'Pick at least one day of the week the kitchen is open',
      });
    }
    // Large-order lead time only makes sense paired with a threshold and
    // vice-versa - either both null or both set, never one without the
    // other (otherwise the validator silently no-ops one of them).
    const nextLargeLead =
      dto.largeOrderLeadHours !== undefined ? dto.largeOrderLeadHours : vendor.largeOrderLeadHours;
    const nextLargeThreshold =
      dto.largeOrderTrayThreshold !== undefined
        ? dto.largeOrderTrayThreshold
        : vendor.largeOrderTrayThreshold;
    if ((nextLargeLead === null) !== (nextLargeThreshold === null)) {
      throw new BadRequestException({
        code: 'LARGE_ORDER_FIELDS_MUST_PAIR',
        message: 'Large-order lead time and tray threshold must be set together or both cleared',
      });
    }

    await this.prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        ...(dto.openingDays !== undefined ? { openingDays: dto.openingDays } : {}),
        ...(dto.slotOpenHour !== undefined ? { slotOpenHour: dto.slotOpenHour } : {}),
        ...(dto.slotCloseHour !== undefined ? { slotCloseHour: dto.slotCloseHour } : {}),
        ...(dto.prepLeadHours !== undefined ? { prepLeadHours: dto.prepLeadHours } : {}),
        ...(dto.maxOrdersPerDay !== undefined ? { maxOrdersPerDay: dto.maxOrdersPerDay } : {}),
        ...(dto.maxTraysPerDay !== undefined ? { maxTraysPerDay: dto.maxTraysPerDay } : {}),
        ...(dto.sameDayOrders !== undefined ? { sameDayOrders: dto.sameDayOrders } : {}),
        ...(dto.largeOrderLeadHours !== undefined
          ? { largeOrderLeadHours: dto.largeOrderLeadHours }
          : {}),
        ...(dto.largeOrderTrayThreshold !== undefined
          ? { largeOrderTrayThreshold: dto.largeOrderTrayThreshold }
          : {}),
        ...(dto.eventCateringManualQuote !== undefined
          ? { eventCateringManualQuote: dto.eventCateringManualQuote }
          : {}),
      },
    });
    return this.getAvailabilityById(vendor.id);
  }

  async addMyBlackout(userId: string, dto: AddBlackoutDto) {
    const vendor = await this.resolveMyVendor(userId, VENDOR_AVAILABILITY_ROLES);
    const day = parseIsoCalendarDate(dto.date);
    if (!day) {
      throw new BadRequestException({
        code: 'INVALID_BLACKOUT_DATE',
        message: 'Blackout date is not a valid calendar date',
      });
    }
    // Upsert so a vendor double-clicking "Add" doesn't get a 409.
    await this.prisma.blackoutDate.upsert({
      where: { vendorId_date: { vendorId: vendor.id, date: day } },
      create: { vendorId: vendor.id, date: day, reason: dto.reason ?? null },
      update: { reason: dto.reason ?? null },
    });
    return this.getAvailabilityById(vendor.id);
  }

  async removeMyBlackout(userId: string, blackoutId: string) {
    const vendor = await this.resolveMyVendor(userId, VENDOR_AVAILABILITY_ROLES);
    // Scope the delete by vendorId so a malicious id can't take out
    // another vendor's blackout row.
    const res = await this.prisma.blackoutDate.deleteMany({
      where: { id: blackoutId, vendorId: vendor.id },
    });
    if (res.count === 0) {
      throw new NotFoundException({ code: 'BLACKOUT_NOT_FOUND', message: 'Blackout not found' });
    }
    return this.getAvailabilityById(vendor.id);
  }

  // ── Per-date capacity (vendor_capacity) ────────────────────────────

  /**
   * Authed-vendor list of every configured capacity row from today
   * forward (no upper bound - a vendor must be able to see and manage
   * any future row they created, and the per-vendor row count is small).
   * Includes row ids so the portal can edit/delete, unlike the public
   * availability `capacity` array.
   */
  async getMyCapacity(userId: string) {
    const vendor = await this.resolveMyVendor(userId, VENDOR_AVAILABILITY_ROLES);
    const today = new Date();
    const start = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const rows = await this.prisma.vendorCapacity.findMany({
      where: { vendorId: vendor.id, serviceDate: { gte: start } },
      orderBy: [{ serviceDate: 'asc' }, { capacityType: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      serviceDate: formatIsoDate(r.serviceDate),
      capacityType: r.capacityType,
      totalSlots: r.totalSlots,
      slotsTaken: r.slotsTaken,
      remainingSlots: r.totalSlots - r.slotsTaken,
      preorderCutoffAt: r.preorderCutoffAt ? r.preorderCutoffAt.toISOString() : null,
    }));
  }

  /**
   * Upsert one (serviceDate, capacityType) capacity row for the authed
   * vendor, optionally repeated weekly. Guards:
   *   - date must be a valid calendar day, today or later
   *   - totalSlots can never be set below slotsTaken already reserved
   *   - preorderCutoffAt (when given) must not be after the service date's
   *     end of day - a cutoff after the event is meaningless
   * When repeating weekly, the cutoff is shifted by the same number of
   * days for each following week so "cutoff 6pm the day before" stays
   * true for every repeated date.
   */
  async upsertMyCapacity(userId: string, dto: UpsertCapacityDto) {
    const vendor = await this.resolveMyVendor(userId, VENDOR_AVAILABILITY_ROLES);
    const day = parseIsoCalendarDate(dto.serviceDate);
    if (!day) {
      throw new BadRequestException({
        code: 'INVALID_SERVICE_DATE',
        message: 'Service date is not a valid calendar date',
      });
    }
    const today = new Date();
    const todayStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    if (day < todayStart) {
      throw new BadRequestException({
        code: 'SERVICE_DATE_IN_PAST',
        message: 'Service date cannot be in the past',
      });
    }
    let cutoff: Date | null = null;
    if (dto.preorderCutoffAt) {
      cutoff = new Date(dto.preorderCutoffAt);
      if (Number.isNaN(cutoff.getTime())) {
        throw new BadRequestException({
          code: 'INVALID_CUTOFF',
          message: 'Pre-order cutoff is not a valid timestamp',
        });
      }
      const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000);
      if (cutoff > dayEnd) {
        throw new BadRequestException({
          code: 'CUTOFF_AFTER_SERVICE_DATE',
          message: 'Pre-order cutoff must be on or before the service date',
        });
      }
    }

    const weeks = dto.repeatWeeks ?? 0;
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const targets = Array.from({ length: weeks + 1 }, (_, w) => ({
      date: new Date(day.getTime() + w * weekMs),
      cutoff: cutoff ? new Date(cutoff.getTime() + w * weekMs) : null,
    }));

    // All-or-nothing: every check + write runs in ONE transaction so a
    // conflict on week 5 can't leave weeks 0-4 silently persisted. The
    // existing rows are locked FOR UPDATE so a concurrent reservation
    // can't bump slots_taken past the new cap between check and write
    // (the DB CHECK constraint remains the final backstop).
    await this.prisma.$transaction(async (tx) => {
      const dateLiterals = targets.map((t) => formatIsoDate(t.date));
      const locked = await tx.$queryRaw<{ service_date: Date; slots_taken: number }[]>`
        SELECT "service_date", "slots_taken"
        FROM "vendor_capacity"
        WHERE "vendor_id" = ${vendor.id}::uuid
          AND "capacity_type" = ${dto.capacityType}::"vendor_capacity_type"
          AND "service_date" = ANY(${dateLiterals}::date[])
        FOR UPDATE`;
      for (const row of locked) {
        if (row.slots_taken > dto.totalSlots) {
          throw new ConflictException({
            code: 'SLOTS_BELOW_TAKEN',
            message: `Cannot set ${formatIsoDate(row.service_date)} to ${dto.totalSlots} slots: ${row.slots_taken} already taken`,
          });
        }
      }
      for (const t of targets) {
        await tx.vendorCapacity.upsert({
          where: {
            vendorId_serviceDate_capacityType: {
              vendorId: vendor.id,
              serviceDate: t.date,
              capacityType: dto.capacityType,
            },
          },
          create: {
            vendorId: vendor.id,
            serviceDate: t.date,
            capacityType: dto.capacityType,
            totalSlots: dto.totalSlots,
            preorderCutoffAt: t.cutoff,
          },
          update: { totalSlots: dto.totalSlots, preorderCutoffAt: t.cutoff },
        });
      }
    });
    return this.getMyCapacity(userId);
  }

  async removeMyCapacity(userId: string, capacityId: string) {
    const vendor = await this.resolveMyVendor(userId, VENDOR_AVAILABILITY_ROLES);
    // Scope by vendorId so a foreign id can't delete another vendor's row.
    const res = await this.prisma.vendorCapacity.deleteMany({
      where: { id: capacityId, vendorId: vendor.id },
    });
    if (res.count === 0) {
      throw new NotFoundException({ code: 'CAPACITY_NOT_FOUND', message: 'Capacity not found' });
    }
    return this.getMyCapacity(userId);
  }
}

function formatIsoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoCalendarDate(s: string): Date | null {
  // Accepts YYYY-MM-DD or full ISO 8601; we only ever persist the
  // calendar-day midnight-UTC value (the column is DATE).
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
