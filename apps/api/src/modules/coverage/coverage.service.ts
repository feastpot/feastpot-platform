import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import type { CoverageInterestDto } from './dto/coverage-interest.dto';

/**
 * Canonicalise a UK-style postcode for storage so the same place always
 * collapses to one form: strip all whitespace, upper-case, then re-insert
 * the single space before the final three "inward" characters. This makes
 * "se1 7ty", "SE17TY" and "SE1  7TY" all become "SE1 7TY" — which keeps the
 * (email, postcode) dedupe accurate and the admin "top postcodes" readable.
 */
function canonicalisePostcode(raw: string): string {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  if (compact.length <= 3) return compact;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

/**
 * Captures customer interest from the uncovered-postcode waitlist page and
 * persists it to the `coverage_interests` table so ops can size demand by
 * area and email leads the moment a vendor goes live near them.
 *
 * Dedupe is enforced by a DB unique constraint on (email, postcode) rather
 * than a read-then-write check, so concurrent identical submissions can't
 * both insert and inflate the waitlist count. A duplicate insert raises
 * Prisma P2002, which we swallow and treat as success — the public form
 * should never surface a "you already signed up" error.
 *
 * The response stays `{ ok: true }` to preserve the contract the web client
 * (`registerCoverageInterest`) expects across this persistence swap.
 */
@Injectable()
export class CoverageService {
  private readonly logger = new Logger(CoverageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registerInterest(dto: CoverageInterestDto) {
    const postcode = canonicalisePostcode(dto.postcode);
    const email = dto.email.trim().toLowerCase();
    const name = dto.name?.trim() || null;

    try {
      await this.prisma.coverageInterest.create({
        data: {
          email,
          postcode,
          name,
          marketingConsent: dto.marketingConsent ?? null,
          source: 'coverage-check',
        },
      });
      this.logger.log(`[coverage-interest] saved postcode=${postcode} email=${email}`);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.log(`[coverage-interest] duplicate postcode=${postcode} email=${email}`);
        return { ok: true as const };
      }
      throw err;
    }

    return { ok: true as const };
  }
}
