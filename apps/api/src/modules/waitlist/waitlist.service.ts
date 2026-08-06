import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

import { extractOutwardCode, normalisePostcode } from '../../common/postcode.util';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailProvider } from '../notifications/providers/email.provider';

import type { CreateWaitlistDto } from './dto/create-waitlist.dto';
import { waitlistConfirmationTemplate } from './templates/waitlist-confirmation.template';

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  async register(dto: CreateWaitlistDto): Promise<{ ok: true }> {
    // Honeypot check - return success immediately without persisting.
    if (dto.website) {
      this.logger.log('[waitlist] honeypot triggered');
      return { ok: true };
    }

    const postcode = normalisePostcode(dto.postcode);
    const outwardCode = extractOutwardCode(postcode);
    const email = dto.email.trim().toLowerCase();

    try {
      await this.prisma.postcodeWaitlist.create({
        data: {
          postcode,
          outwardCode,
          email,
          whatsapp: dto.whatsapp?.trim() || null,
          favouriteCuisine: dto.favouriteCuisine?.trim() || null,
          source: dto.source,
        },
      });
      this.logger.log(`[waitlist] saved outwardCode=${outwardCode} email=${email}`);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.log(`[waitlist] duplicate outwardCode=${outwardCode} email=${email}`);
        return { ok: true };
      }
      throw err;
    }

    // Customer confirmation - fire-and-forget; failure must not 500 the request.
    try {
      const msg = waitlistConfirmationTemplate({ postcode, outwardCode });
      await this.email.send({ to: email, subject: msg.subject, html: msg.html });
    } catch (err) {
      this.logger.warn(
        `[waitlist] confirmation email failed for ${email}: ${(err as Error).message}`,
      );
    }

    return { ok: true };
  }

  /** Admin: demand grouped by outward code, sorted by count desc. */
  async getDemand(): Promise<{ outwardCode: string; count: number; latestAt: string }[]> {
    const rows = await this.prisma.postcodeWaitlist.groupBy({
      by: ['outwardCode'],
      _count: { outwardCode: true },
      _max: { createdAt: true },
      orderBy: { _count: { outwardCode: 'desc' } },
    });
    return rows.map((r) => ({
      outwardCode: r.outwardCode,
      count: r._count.outwardCode,
      latestAt: r._max.createdAt?.toISOString() ?? '',
    }));
  }

  /** Admin: paginated list of raw signups. */
  async list(opts: { cursor?: string; limit?: number }) {
    const limit = opts.limit ?? 50;
    const rows = await this.prisma.postcodeWaitlist.findMany({
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
}
