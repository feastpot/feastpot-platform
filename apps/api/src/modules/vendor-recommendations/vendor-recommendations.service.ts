import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { extractOutwardCode, normalisePostcode } from '../../common/postcode.util';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailProvider } from '../notifications/providers/email.provider';

import type { CreateVendorRecommendationDto } from './dto/create-vendor-recommendation.dto';
import { vendorRecommendationInternalTemplate } from './templates/vendor-recommendation-internal.template';

@Injectable()
export class VendorRecommendationsService {
  private readonly logger = new Logger(VendorRecommendationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateVendorRecommendationDto): Promise<{ ok: true }> {
    // Honeypot
    if (dto.website) {
      this.logger.log('[vendor-rec] honeypot triggered');
      return { ok: true };
    }

    // At least one of businessName, instagramHandle, phone must be present.
    if (!dto.businessName && !dto.instagramHandle && !dto.phone) {
      throw new BadRequestException(
        'At least one of businessName, instagramHandle, or phone is required',
      );
    }

    const postcode = dto.postcode ? normalisePostcode(dto.postcode) : null;
    const outwardCode = postcode ? extractOutwardCode(postcode) : null;

    await this.prisma.vendorRecommendation.create({
      data: {
        businessName: dto.businessName?.trim() || null,
        instagramHandle: dto.instagramHandle?.trim().replace(/^@/, '') || null,
        phone: dto.phone?.trim() || null,
        outwardCode,
        recommendedByEmail: dto.recommendedByEmail?.trim().toLowerCase() || null,
        status: 'NEW',
      },
    });

    this.logger.log(`[vendor-rec] saved businessName=${dto.businessName ?? '–'}`);

    // Internal alert - fire-and-forget.
    try {
      const adminEmail =
        this.config.get<string>('VENDOR_APPLICATIONS_ADMIN_EMAIL') ?? 'soul@feastpot.co.uk';
      const msg = vendorRecommendationInternalTemplate({
        businessName: dto.businessName,
        instagramHandle: dto.instagramHandle,
        phone: dto.phone,
        outwardCode: outwardCode ?? undefined,
        recommendedByEmail: dto.recommendedByEmail,
      });
      await this.email.send({ to: adminEmail, subject: msg.subject, html: msg.html });
    } catch (err) {
      this.logger.warn(`[vendor-rec] internal alert failed: ${(err as Error).message}`);
    }

    return { ok: true };
  }

  /** Admin: paginated list, newest first. */
  async list(opts: { status?: string; cursor?: string; limit?: number }) {
    const limit = opts.limit ?? 50;
    const where = opts.status && opts.status !== 'ALL' ? { status: opts.status } : {};
    const rows = await this.prisma.vendorRecommendation.findMany({
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

  /** Admin: update status and/or notes. */
  async updateStatus(id: string, status: string, adminNotes?: string) {
    return this.prisma.vendorRecommendation.update({
      where: { id },
      data: { status, ...(adminNotes !== undefined ? { adminNotes } : {}) },
    });
  }
}
