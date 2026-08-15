import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AttributionSource, OrderSource, OrderStatus, Prisma } from '@prisma/client';
import * as QRCode from 'qrcode';

import { SupabaseService } from '../../auth/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';

import { RecordClickDto } from './dto/record-click.dto';

const QR_BUCKET = 'feastpot-media';

/** 30-day expiry for VENDOR marker (fp_ref cookie). */
const VENDOR_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** 90-day expiry for MARKETPLACE marker (fp_mp_{vendorId} cookie). */
const MARKETPLACE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Parse the fp_ref cookie value.
 * Format: `<referralLinkId>|<clickId>|<timestampMs>`
 * Returns null if malformed or outside the 30-day VENDOR window.
 */
export function parseFpRef(
  raw: string | null | undefined,
): { referralLinkId: string; clickId: string; ts: number } | null {
  if (!raw) return null;
  const parts = raw.split('|');
  if (parts.length !== 3) return null;
  const [referralLinkId, clickId, tsStr] = parts as [string, string, string];
  const ts = parseInt(tsStr, 10);
  if (!referralLinkId || !clickId || Number.isNaN(ts)) return null;
  if (Date.now() - ts > VENDOR_WINDOW_MS) return null; // expired (30 days)
  return { referralLinkId, clickId, ts };
}

/** Build a cookie-safe fp_ref value. */
export function buildFpRef(referralLinkId: string, clickId: string): string {
  return `${referralLinkId}|${clickId}|${Date.now()}`;
}

/**
 * Parse the X-Fp-Mktplace header / fp_mp_{vendorId} cookie value.
 * Format: `<timestampMs>` (plain integer string).
 * Returns the timestamp or null if malformed or outside the 90-day MARKETPLACE window.
 */
export function parseFpMktp(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const ts = parseInt(raw, 10);
  if (Number.isNaN(ts)) return null;
  if (Date.now() - ts > MARKETPLACE_WINDOW_MS) return null; // expired (90 days)
  return ts;
}

/** Derive the three-tier AttributionSource label from source + isFirstOrder. */
export function toResolvedSource(source: OrderSource, isFirstOrder: boolean): AttributionSource {
  if (source === OrderSource.VENDOR_REFERRED) return AttributionSource.VENDOR_REFERRED;
  return isFirstOrder ? AttributionSource.MARKETPLACE_FIRST : AttributionSource.MARKETPLACE_REPEAT;
}

function generateSlug(businessName: string): string {
  const base = businessName
    .toLowerCase()
    .replace(/'/g, '') // strip apostrophes: "maman's" → "mamans", not "maman-s"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const suffix = Math.random().toString(36).slice(2, 8);
  return base ? `${base}-${suffix}` : suffix;
}

@Injectable()
export class AttributionService {
  private readonly logger = new Logger(AttributionService.name);
  private readonly webBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {
    this.webBaseUrl = config.get<string>('WEB_BASE_URL') ?? 'https://feastpot.co.uk';
  }

  // ─── Referral links ─────────────────────────────────────────────────────────

  async getOrCreateLink(vendorId: string) {
    const existing = await this.prisma.vendorReferralLink.findUnique({
      where: { vendorId },
    });
    if (existing) return this.withReferralUrl(existing);

    const vendor = await this.prisma.vendor.findUniqueOrThrow({
      where: { id: vendorId },
      select: { businessName: true, slug: true },
    });

    // Generate unique slug with retry.
    let slug = generateSlug(vendor.businessName);
    for (let attempt = 0; attempt < 5; attempt++) {
      const taken = await this.prisma.vendorReferralLink.findUnique({ where: { slug } });
      if (!taken) break;
      slug = generateSlug(vendor.businessName);
    }

    const link = await this.prisma.vendorReferralLink.create({
      data: { vendorId, slug },
    });

    // Generate QR synchronously so the very first response includes qrUrls.
    // If generation fails (e.g. Supabase Storage unreachable), we return
    // qrUrls: null and the client self-heals with a browser-side QR render.
    let qrUrls: { png: string; svg: string } | null = null;
    try {
      qrUrls = await this.generateAndStoreQr(link.id, link.slug);
    } catch (err) {
      this.logger.error(`QR generation failed for new link ${link.id}: ${String(err)}`);
    }

    return { ...this.withReferralUrl(link), qrUrls };
  }

  /**
   * Generate QR code PNG (1024x1024) + SVG, upload to Supabase Storage,
   * persist the public URLs, and return them.
   * Pure black on white so scanners never reject tinted codes.
   */
  async generateAndStoreQr(linkId: string, slug: string): Promise<{ png: string; svg: string }> {
    // The &m=qr marker distinguishes QR scans from plain link clicks in the
    // /v/[slug]/route.ts handler, which uses it to fire a qr_scan analytics
    // event server-side. Any stored QRs without this flag will still work
    // (they redirect normally) but won't fire the dedicated qr_scan event.
    const referralUrl = `${this.webBaseUrl}/v/${slug}?m=qr`;

    const [pngBuffer, svgString] = await Promise.all([
      QRCode.toBuffer(referralUrl, {
        type: 'png',
        width: 1024,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      }),
      QRCode.toString(referralUrl, { type: 'svg' }),
    ]);

    const storage = this.supabase.getClient().storage.from(QR_BUCKET);
    const pngPath = `referral-qr/${linkId}/qr.png`;
    const svgPath = `referral-qr/${linkId}/qr.svg`;

    const [pngUpload, svgUpload] = await Promise.all([
      storage.upload(pngPath, pngBuffer, { contentType: 'image/png', upsert: true }),
      storage.upload(svgPath, Buffer.from(svgString), {
        contentType: 'image/svg+xml',
        upsert: true,
      }),
    ]);

    if (pngUpload.error) throw new Error(pngUpload.error.message);
    if (svgUpload.error) throw new Error(svgUpload.error.message);

    const { data: pngData } = storage.getPublicUrl(pngPath);
    const { data: svgData } = storage.getPublicUrl(svgPath);

    const urls = { png: pngData.publicUrl, svg: svgData.publicUrl };

    await this.prisma.vendorReferralLink.update({
      where: { id: linkId },
      data: { qrCodeUrl: JSON.stringify(urls) },
    });

    return urls;
  }

  /**
   * Backfill QR codes for any existing VendorReferralLink rows that lack them.
   * Safe to run multiple times; only touches rows where qrCodeUrl IS NULL.
   */
  async backfillMissingQr(): Promise<{ processed: number; failed: number }> {
    const links = await this.prisma.vendorReferralLink.findMany({
      where: { qrCodeUrl: null },
      select: { id: true, slug: true },
    });

    this.logger.log(`QR backfill: ${links.length} link(s) to process`);

    let processed = 0;
    let failed = 0;
    for (const link of links) {
      try {
        await this.generateAndStoreQr(link.id, link.slug);
        processed++;
        this.logger.log(`QR backfill: generated for link ${link.id}`);
      } catch (err) {
        this.logger.error(`QR backfill failed for link ${link.id}: ${String(err)}`);
        failed++;
      }
    }

    this.logger.log(`QR backfill complete: ${processed} ok, ${failed} failed`);
    return { processed, failed };
  }

  /**
   * Regenerate stored QR codes for all referral links that already have a
   * qrCodeUrl, so they encode the ?m=qr tracking marker.
   *
   * The original backfillMissingQr() only touched IS-NULL rows; this handles
   * the inverse set: rows that have a QR but generated before the marker was
   * introduced.  generateAndStoreQr() now produces ?m=qr URLs and overwrites
   * the existing image in Supabase Storage.
   *
   * Use dryRun=true first to confirm scope before committing.
   */
  async backfillQrMarkers(
    dryRun: boolean,
  ): Promise<{ processed: number; failed: number; dryRun: boolean; slugs?: string[] }> {
    const links = await this.prisma.vendorReferralLink.findMany({
      where: { qrCodeUrl: { not: null } },
      select: { id: true, slug: true },
    });

    if (dryRun) {
      this.logger.log(`QR marker backfill (dry-run): ${links.length} link(s) would be regenerated`);
      return {
        dryRun: true,
        processed: links.length,
        failed: 0,
        slugs: links.map((l) => l.slug),
      };
    }

    this.logger.log(`QR marker backfill: regenerating ${links.length} QR code(s)`);
    let processed = 0;
    let failed = 0;

    for (const link of links) {
      try {
        await this.generateAndStoreQr(link.id, link.slug);
        processed++;
      } catch (err) {
        this.logger.error(`QR marker backfill failed for slug=${link.slug}: ${String(err)}`);
        failed++;
      }
    }

    this.logger.log(`QR marker backfill complete: ${processed} ok, ${failed} failed`);
    return { dryRun: false, processed, failed };
  }

  private withReferralUrl(link: {
    id: string;
    vendorId: string;
    slug: string;
    qrCodeUrl: string | null;
    createdAt: Date;
  }) {
    return {
      ...link,
      referralUrl: `${this.webBaseUrl}/v/${link.slug}`,
      qrUrls: link.qrCodeUrl ? (JSON.parse(link.qrCodeUrl) as { png: string; svg: string }) : null,
    };
  }

  // ─── Referral clicks ────────────────────────────────────────────────────────

  async recordClick(dto: RecordClickDto) {
    const link = await this.prisma.vendorReferralLink.findUnique({
      where: { slug: dto.slug },
      select: { id: true, slug: true, vendorId: true, vendor: { select: { slug: true } } },
    });
    if (!link) {
      // The slug is not a VendorReferralLink slug. It may be a Vendor display slug
      // (Vendor.slug) from the old /share page or a printed QR code issued before
      // this fix. Look up the vendor and return their canonical referral-link slug
      // so the /v/[slug] route can 301-redirect the visitor. The redirect causes the
      // next request to arrive at the canonical slug, which records the click and
      // sets fp_ref correctly - preserving attribution for printed QR codes.
      const vendor = await this.prisma.vendor.findUnique({
        where: { slug: dto.slug },
        select: { id: true },
      });
      const redirectToSlug = vendor
        ? ((
            await this.prisma.vendorReferralLink.findUnique({
              where: { vendorId: vendor.id },
              select: { slug: true },
            })
          )?.slug ?? null)
        : null;
      return {
        ok: false,
        vendorSlug: null,
        referralLinkId: null,
        clickId: null,
        vendorId: null,
        redirectToSlug,
      };
    }

    const click = await this.prisma.referralClick.create({
      data: {
        referralLinkId: link.id,
        sessionId: dto.sessionId,
        userId: dto.userId ?? null,
        ipHash: dto.ipHash,
        userAgent: dto.userAgent?.slice(0, 512) ?? null,
      },
    });

    return {
      ok: true,
      vendorSlug: link.vendor.slug,
      referralLinkId: link.id,
      clickId: click.id,
      vendorId: link.vendorId,
    };
  }

  // ─── Source pre-resolution (called BEFORE order tx for commission calc) ──────

  /**
   * Resolve source + isFirstOrder without writing to the DB.
   * Called before finishCreateOrder so CommissionService can compute the
   * correct commission BEFORE the order row is created.
   *
   * Override rule: a valid MARKETPLACE marker (90-day window) takes precedence
   * over a VENDOR marker (30-day window) for the same vendor. This implements
   * the spec rule that platform-sourced discovery is never overwritten by a
   * later vendor referral click.
   *
   * Never throws - defaults to MARKETPLACE / isFirstOrder=true on any error.
   */
  async preResolveSource(
    fpRef: string | null | undefined,
    sessionId: string | null | undefined,
    customerId: string,
    vendorId: string,
    marketplaceMarker?: string | null,
  ): Promise<{ source: OrderSource; isFirstOrder: boolean }> {
    try {
      let source: OrderSource = OrderSource.MARKETPLACE;

      // MARKETPLACE marker (90-day) takes precedence over VENDOR marker (30-day).
      // If the customer browsed via marketplace within the last 90 days, they are
      // marketplace-attributed regardless of any subsequent referral click.
      const mktp = parseFpMktp(marketplaceMarker);
      if (mktp !== null) {
        // Marketplace marker valid and within 90-day window → force MARKETPLACE.
        source = OrderSource.MARKETPLACE;
      } else {
        // No valid marketplace marker: check VENDOR marker.
        const parsed = parseFpRef(fpRef);
        if (parsed) {
          const link = await this.prisma.vendorReferralLink.findUnique({
            where: { id: parsed.referralLinkId },
            select: { id: true, vendorId: true },
          });
          if (link?.vendorId === vendorId) {
            source = OrderSource.VENDOR_REFERRED;
          }
        } else if (sessionId) {
          const cutoff = new Date(Date.now() - VENDOR_WINDOW_MS);
          const click = await this.prisma.referralClick.findFirst({
            where: { sessionId, clickedAt: { gte: cutoff }, referralLink: { vendorId } },
            orderBy: { clickedAt: 'desc' },
            select: { id: true },
          });
          if (click) source = OrderSource.VENDOR_REFERRED;
        }
      }

      const priorOrder = await this.prisma.order.findFirst({
        where: { customerId, vendorId, status: OrderStatus.delivered },
        select: { id: true },
      });

      return { source, isFirstOrder: !priorOrder };
    } catch (err) {
      this.logger.warn(
        `[attribution] preResolveSource failed for customerId=${customerId}: ${String(err)}; defaulting to MARKETPLACE/first`,
      );
      return { source: OrderSource.MARKETPLACE, isFirstOrder: true };
    }
  }

  // ─── Attribution (called inside order transaction) ───────────────────────────

  /**
   * Resolve source and write an immutable OrderAttribution row.
   * Must be called inside the same Prisma $transaction as order creation.
   *
   * Override rule: a valid MARKETPLACE marker (90-day) takes precedence over a
   * VENDOR marker (30-day). Once written, this row is never updated.
   *
   * Never throws - a failed attribution falls back to MARKETPLACE with a log.
   */
  async resolveAndWriteInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    customerId: string,
    vendorId: string,
    fpRef: string | null | undefined,
    sessionId: string | null | undefined,
    marketplaceMarker?: string | null,
  ): Promise<void> {
    try {
      let source: OrderSource = OrderSource.MARKETPLACE;
      let referralLinkId: string | null = null;
      let referralClickId: string | null = null;
      let attributionReason = 'organic';
      let markerSetAt: Date | null = null;

      // MARKETPLACE marker (90-day) overrides any VENDOR marker.
      const mktpTs = parseFpMktp(marketplaceMarker);
      if (mktpTs !== null) {
        source = OrderSource.MARKETPLACE;
        attributionReason = 'marketplace_marker';
        markerSetAt = new Date(mktpTs);
      } else {
        // No valid marketplace marker: check VENDOR marker (fp_ref cookie).
        const parsed = parseFpRef(fpRef);

        if (parsed) {
          const link = await tx.vendorReferralLink.findUnique({
            where: { id: parsed.referralLinkId },
            select: { id: true, vendorId: true },
          });
          if (link) {
            if (link.vendorId === vendorId) {
              source = OrderSource.VENDOR_REFERRED;
              referralLinkId = link.id;
              referralClickId = parsed.clickId;
              attributionReason = 'fp_ref_cookie';
              markerSetAt = new Date(parsed.ts);
            } else {
              // Cross-vendor: cookie exists but belongs to a different vendor.
              attributionReason = 'cross_vendor_referral';
            }
          } else {
            attributionReason = 'fp_ref_unknown_link';
          }
        } else if (sessionId) {
          // Cookie-loss fallback: look up the most recent click for this session
          // that resolves to the same vendor within the 30-day VENDOR window.
          const cutoff = new Date(Date.now() - VENDOR_WINDOW_MS);
          const click = await tx.referralClick.findFirst({
            where: {
              sessionId,
              clickedAt: { gte: cutoff },
              referralLink: { vendorId },
            },
            orderBy: { clickedAt: 'desc' },
            select: { id: true, referralLinkId: true, clickedAt: true },
          });
          if (click) {
            source = OrderSource.VENDOR_REFERRED;
            referralLinkId = click.referralLinkId;
            referralClickId = click.id;
            attributionReason = 'session_fallback';
            markerSetAt = click.clickedAt;
          }
        }
      }

      // isFirstOrder: no prior delivered order for this customer+vendor pair.
      const priorOrder = await tx.order.findFirst({
        where: { customerId, vendorId, status: OrderStatus.delivered },
        select: { id: true },
      });
      const isFirstOrder = !priorOrder;

      // Derive the three-tier label for reporting / commission schedule display.
      const resolvedSource = toResolvedSource(source, isFirstOrder);

      await tx.orderAttribution.create({
        data: {
          orderId,
          source,
          referralLinkId,
          referralClickId,
          isFirstOrder,
          attributionReason,
          resolvedSource,
          markerSetAt,
        },
      });
    } catch (err) {
      // Attribution failure must never break order creation.
      this.logger.error(
        `[attribution] resolveAndWriteInTx failed for orderId=${orderId}: ${String(err)}`,
      );
    }
  }

  // ─── Vendor source split stats ───────────────────────────────────────────────

  async getVendorSplit(
    vendorId: string,
    _from?: Date,
    _to?: Date,
  ): Promise<{
    thisWeek: Record<string, { orders: number; gmvPence: number }>;
    cumulative: Record<string, { orders: number; gmvPence: number }>;
  }> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
    weekStart.setHours(0, 0, 0, 0);

    // Single combined raw query per period: count + GMV grouped by three-tier tier.
    // Rows with a null resolved_source (pre-migration) fall back to source + is_first_order.
    type RawRow = { tier: string; order_count: bigint; gmv: bigint };

    // Reusable SQL fragment via Prisma.sql so it is embedded safely (not concatenated).
    const tierExpr = Prisma.sql`COALESCE(
      oa.resolved_source::text,
      CASE
        WHEN oa.source = 'VENDOR_REFERRED' THEN 'VENDOR_REFERRED'
        WHEN oa.is_first_order = false      THEN 'MARKETPLACE_REPEAT'
        ELSE                                     'MARKETPLACE_FIRST'
      END
    )`;

    const [weekRows, totalRows] = await Promise.all([
      this.prisma.$queryRaw<RawRow[]>`
        SELECT
          ${tierExpr} AS tier,
          COUNT(*)::bigint                             AS order_count,
          COALESCE(SUM(o.total_pence), 0)::bigint     AS gmv
        FROM order_attributions oa
        JOIN orders o ON oa.order_id = o.id
        WHERE o.vendor_id = ${vendorId}::uuid
          AND o.status = 'delivered'
          AND o.created_at >= ${weekStart}
        GROUP BY tier
      `,
      this.prisma.$queryRaw<RawRow[]>`
        SELECT
          ${tierExpr} AS tier,
          COUNT(*)::bigint                             AS order_count,
          COALESCE(SUM(o.total_pence), 0)::bigint     AS gmv
        FROM order_attributions oa
        JOIN orders o ON oa.order_id = o.id
        WHERE o.vendor_id = ${vendorId}::uuid
          AND o.status = 'delivered'
        GROUP BY tier
      `,
    ]);

    function toMap(rows: RawRow[]): Record<string, { orders: number; gmvPence: number }> {
      const result: Record<string, { orders: number; gmvPence: number }> = {};
      for (const row of rows) {
        result[row.tier] = { orders: Number(row.order_count), gmvPence: Number(row.gmv) };
      }
      return result;
    }

    return {
      thisWeek: toMap(weekRows),
      cumulative: toMap(totalRows),
    };
  }

  // ─── Admin ───────────────────────────────────────────────────────────────────

  async listForAdmin(filters: {
    source?: OrderSource;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const where: Prisma.OrderAttributionWhereInput = {};
    if (filters.source) where.source = filters.source;
    if (filters.from || filters.to) {
      where.attributedAt = {};
      if (filters.from) where.attributedAt.gte = new Date(filters.from);
      if (filters.to) where.attributedAt.lte = new Date(filters.to);
    }

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));

    const [rows, total] = await Promise.all([
      this.prisma.orderAttribution.findMany({
        where,
        orderBy: { attributedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: {
            select: {
              orderNumber: true,
              totalPence: true,
              createdAt: true,
              vendor: { select: { businessName: true } },
              customer: { select: { email: true } },
            },
          },
        },
      }),
      this.prisma.orderAttribution.count({ where }),
    ]);

    return { rows, total, page, pageSize };
  }

  async csvForAdmin(filters: {
    source?: OrderSource;
    from?: string;
    to?: string;
  }): Promise<string> {
    const where: Prisma.OrderAttributionWhereInput = {};
    if (filters.source) where.source = filters.source;
    if (filters.from || filters.to) {
      where.attributedAt = {};
      if (filters.from) where.attributedAt.gte = new Date(filters.from);
      if (filters.to) where.attributedAt.lte = new Date(filters.to);
    }

    const rows = await this.prisma.orderAttribution.findMany({
      where,
      orderBy: { attributedAt: 'desc' },
      take: 10_000,
      include: {
        order: {
          select: {
            orderNumber: true,
            totalPence: true,
            createdAt: true,
            vendor: { select: { businessName: true } },
            customer: { select: { email: true } },
          },
        },
      },
    });

    const header =
      'order_id,order_number,vendor,customer_email,source,resolved_source,is_first_order,' +
      'attribution_reason,referral_link_id,referral_click_id,marker_set_at,' +
      'attributed_at,order_total_pence,order_created_at\n';

    const lines = rows.map((r) =>
      [
        r.orderId,
        r.order.orderNumber,
        `"${r.order.vendor.businessName.replace(/"/g, '""')}"`,
        r.order.customer?.email ?? '',
        r.source,
        r.resolvedSource ?? '',
        r.isFirstOrder ? '1' : '0',
        r.attributionReason,
        r.referralLinkId ?? '',
        r.referralClickId ?? '',
        r.markerSetAt?.toISOString() ?? '',
        r.attributedAt.toISOString(),
        r.order.totalPence,
        r.order.createdAt.toISOString(),
      ].join(','),
    );

    return header + lines.join('\n');
  }
}
