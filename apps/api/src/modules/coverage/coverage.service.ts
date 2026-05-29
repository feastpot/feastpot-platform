import { Injectable, Logger } from '@nestjs/common';

import type { CoverageInterestDto } from './dto/coverage-interest.dto';

/**
 * Captures customer interest from the uncovered-postcode waitlist page.
 *
 * Persistence is intentionally deferred: the Feastpot Prisma schema has no
 * CoverageInterest model yet, and shipping a migration for a single field-
 * capture endpoint is heavier than the value it returns today. Until the
 * ops team confirms whether this should land in a dedicated table or be
 * forwarded straight to a CRM (HubSpot / Notion / Mailchimp), the service
 * logs the submission at info level so it shows up in the API workflow
 * console and any aggregator we wire up later (Datadog / Sentry breadcrumb
 * etc.) can be filtered by the `[coverage-interest]` tag.
 *
 * Returning `{ ok: true }` keeps the public response stable across the
 * eventual persistence swap.
 */
@Injectable()
export class CoverageService {
  private readonly logger = new Logger(CoverageService.name);

  registerInterest(dto: CoverageInterestDto) {
    const normalisedPostcode = dto.postcode.replace(/\s+/g, ' ').trim().toUpperCase();
    const email = dto.email.trim().toLowerCase();

    this.logger.log(
      `[coverage-interest] postcode=${normalisedPostcode} email=${email}` +
        (dto.name ? ` name="${dto.name.trim()}"` : '') +
        ` marketingConsent=${dto.marketingConsent ?? true}`,
    );

    return { ok: true as const };
  }
}
