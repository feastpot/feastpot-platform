import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderSource, OrderStatus, Prisma } from '@prisma/client';
import * as QRCode from 'qrcode';

import { SupabaseService } from '../../auth/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';

import { RecordClickDto } from './dto/record-click.dto';

const QR_BUCKET = 'feastpot-media';
/** 30-day expiry in milliseconds for fp_ref cookie attribution. */
const ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Parse the fp_ref cookie value.
 * Format: `<referralLinkId>|<clickId>|<timestampMs>`
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
  if (Date.now() - ts > ATTRIBUTION_WINDOW_MS) return null; // expired
  return { referralLinkId, clickId, ts };
}

/** Build a cookie-safe fp_ref value. */
export function buildFpRef(referralLinkId: string, clickId: string): string {
  return `${referralLinkId}|${clickId}|${Date.now()}`;
}

function generateSlug(businessName: string): string {
  const base = businessName
    .toLowerCase()
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

    // Generate QR code asynchronously; don't block the response.
    this.generateAndStoreQr(link.id, link.slug).catch((err) =>
      this.logger.error(`QR generation failed for link ${link.id}: ${String(err)}`),
    );

    return this.withReferralUrl(link);
  }

  /** Generate QR code PNG + SVG, upload to Supabase Storage, persist URL. */
  async generateAndStoreQr(linkId: string, slug: string): Promise<void> {
    const referralUrl = `${this.webBaseUrl}/v/${slug}`;

    const [pngBuffer, svgString] = await Promise.all([
      QRCode.toBuffer(referralUrl, { type: 'png', width: 512, margin: 2 }),
      QRCode.toString(referralUrl, { type: 'svg' }),
    ]);

    const storage = this.supabase.getClient().storage.from(QR_BUCKET);
    const pngPath = `referral-qr/${linkId}/qr.png`;
    const svgPath = `referral-qr/${linkId}/qr.svg`;

    const [pngUpload, svgUpload] = await Promise.all([
      storage.upload(pngPath, pngBuffer, { contentType: 'image/png', upsert: true }),
      storage.upload(svgPath, Buffer.from(svgString), { contentType: 'image/svg+xml', upsert: true }),
    ]);

    if (pngUpload.error) throw new Error(pngUpload.error.message);
    if (svgUpload.error) throw new Error(svgUpload.error.message);

    const { data: pngData } = storage.getPublicUrl(pngPath);
    const { data: svgData } = storage.getPublicUrl(svgPath);

    await this.prisma.vendorReferralLink.update({
      where: { id: linkId },
      data: {
        qrCodeUrl: JSON.stringify({
          png: pngData.publicUrl,
          svg: svgData.publicUrl,
        }),
      },
    });
  }

  private withReferralUrl(link: { id: string; vendorId: string; slug: string; qrCodeUrl: string | null; createdAt: Date }) {
    return {
      ...link,
      referralUrl: `${this.webBaseUrl}/v/${link.slug}`,
      qrUrls: link.qrCodeUrl
        ? (JSON.parse(link.qrCodeUrl) as { png: string; svg: string })
        : null,
    };
  }

  // ─── Referral clicks ────────────────────────────────────────────────────────

  async recordClick(dto: RecordClickDto) {
    const link = await this.prisma.vendorReferralLink.findUnique({
      where: { slug: dto.slug },
      select: { id: true, slug: true, vendor: { select: { slug: true } } },
    });
    if (!link) {
      // Unknown slug - still return a safe redirect target.
      return { ok: false, vendorSlug: null, referralLinkId: null, clickId: null };
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
    };
  }

  // ─── Attribution (called inside order transaction) ───────────────────────────

  /**
   * Resolve source and write an immutable OrderAttribution row.
   * Must be called inside the same Prisma $transaction as order creation.
   * Never throws - a failed attribution falls back to MARKETPLACE with a log.
   */
  async resolveAndWriteInTx(
    tx: Prisma.TransactionClient,
    orderId: string,
    customerId: string,
    vendorId: string,
    fpRef: string | null | undefined,
    sessionId: string | null | undefined,
  ): Promise<void> {
    try {
      let source: OrderSource = OrderSource.MARKETPLACE;
      let referralLinkId: string | null = null;
      let referralClickId: string | null = null;
      let attributionReason = 'organic';

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
          } else {
            // Cross-vendor: cookie exists but belongs to a different vendor.
            attributionReason = 'cross_vendor_referral';
          }
        } else {
          attributionReason = 'fp_ref_unknown_link';
        }
      } else if (sessionId) {
        // Cookie-loss fallback: look up the most recent click for this session
        // that resolves to the same vendor within the attribution window.
        const cutoff = new Date(Date.now() - ATTRIBUTION_WINDOW_MS);
        const click = await tx.referralClick.findFirst({
          where: {
            sessionId,
            clickedAt: { gte: cutoff },
            referralLink: { vendorId },
          },
          orderBy: { clickedAt: 'desc' },
          select: { id: true, referralLinkId: true },
        });
        if (click) {
          source = OrderSource.VENDOR_REFERRED;
          referralLinkId = click.referralLinkId;
          referralClickId = click.id;
          attributionReason = 'session_fallback';
        }
      }

      // isFirstOrder: no prior delivered order for this customer+vendor pair.
      const priorOrder = await tx.order.findFirst({
        where: { customerId, vendorId, status: OrderStatus.delivered },
        select: { id: true },
      });
      const isFirstOrder = !priorOrder;

      await tx.orderAttribution.create({
        data: {
          orderId,
          source,
          referralLinkId,
          referralClickId,
          isFirstOrder,
          attributionReason,
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
    from?: Date,
    to?: Date,
  ): Promise<{
    thisWeek: Record<OrderSource, { orders: number; gmvPence: number }>;
    cumulative: Record<OrderSource, { orders: number; gmvPence: number }>;
  }> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
    weekStart.setHours(0, 0, 0, 0);

    const [weekRows, totalRows] = await Promise.all([
      this.prisma.orderAttribution.groupBy({
        by: ['source'],
        where: {
          order: {
            vendorId,
            status: OrderStatus.delivered,
            createdAt: { gte: weekStart },
          },
        },
        _count: { _all: true },
        _sum: { } as never,
      }),
      this.prisma.orderAttribution.groupBy({
        by: ['source'],
        where: {
          order: { vendorId, status: OrderStatus.delivered },
        },
        _count: { _all: true },
        _sum: { } as never,
      }),
    ]);

    // groupBy doesn't easily cross-join with Order.totalPence; use raw for GMV.
    const [weekGmv, totalGmv] = await Promise.all([
      this.prisma.$queryRaw<Array<{ source: string; gmv: bigint }>>`
        SELECT oa.source, COALESCE(SUM(o.total_pence), 0) AS gmv
        FROM order_attributions oa
        JOIN orders o ON oa.order_id = o.id
        WHERE o.vendor_id = ${vendorId}::uuid
          AND o.status = 'delivered'
          AND o.created_at >= ${weekStart}
        GROUP BY oa.source
      `,
      this.prisma.$queryRaw<Array<{ source: string; gmv: bigint }>>`
        SELECT oa.source, COALESCE(SUM(o.total_pence), 0) AS gmv
        FROM order_attributions oa
        JOIN orders o ON oa.order_id = o.id
        WHERE o.vendor_id = ${vendorId}::uuid
          AND o.status = 'delivered'
        GROUP BY oa.source
      `,
    ]);

    function toMap(
      counts: typeof weekRows,
      gmvRows: typeof weekGmv,
    ): Record<OrderSource, { orders: number; gmvPence: number }> {
      const result: Record<OrderSource, { orders: number; gmvPence: number }> = {
        MARKETPLACE: { orders: 0, gmvPence: 0 },
        VENDOR_REFERRED: { orders: 0, gmvPence: 0 },
      };
      for (const row of counts) {
        result[row.source]!.orders = row._count._all;
      }
      for (const row of gmvRows) {
        const src = row.source as OrderSource;
        result[src]!.gmvPence = Number(row.gmv);
      }
      return result;
    }

    return {
      thisWeek: toMap(weekRows, weekGmv),
      cumulative: toMap(totalRows, totalGmv),
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

  async csvForAdmin(filters: { source?: OrderSource; from?: string; to?: string }): Promise<string> {
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
      'order_id,order_number,vendor,customer_email,source,is_first_order,attribution_reason,' +
      'referral_link_id,referral_click_id,attributed_at,order_total_pence,order_created_at\n';

    const lines = rows.map((r) =>
      [
        r.orderId,
        r.order.orderNumber,
        `"${r.order.vendor.businessName.replace(/"/g, '""')}"`,
        r.order.customer?.email ?? '',
        r.source,
        r.isFirstOrder ? '1' : '0',
        r.attributionReason,
        r.referralLinkId ?? '',
        r.referralClickId ?? '',
        r.attributedAt.toISOString(),
        r.order.totalPence,
        r.order.createdAt.toISOString(),
      ].join(','),
    );

    return header + lines.join('\n');
  }
}
