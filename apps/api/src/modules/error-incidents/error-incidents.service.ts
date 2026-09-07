import { randomBytes } from 'crypto';

import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as Sentry from '@sentry/nestjs';

import type { AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';

import { CreateErrorIncidentDto } from './dto/create-error-incident.dto';

export interface ErrorIncidentRow {
  id: string;
  ref: string;
  app: string;
  route: string;
  message: string;
  digest: string | null;
  vendorId: string | null;
  userId: string | null;
  clientVendorId: string | null;
  clientUserId: string | null;
  createdAt: Date;
}

const MAX_REF_INSERT_ATTEMPTS = 5;

@Injectable()
export class ErrorIncidentsService {
  private readonly logger = new Logger(ErrorIncidentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a human-readable ref in the format FP-XXXX-XXXX (8 uppercase hex
   * characters split into two groups). Vendors can quote this to support and
   * support can look it up instantly in admin.
   */
  private generateRef(): string {
    const a = randomBytes(2).toString('hex').toUpperCase();
    const b = randomBytes(2).toString('hex').toUpperCase();
    return `FP-${a}-${b}`;
  }

  private isRefCollision(error: unknown): boolean {
    const prismaError = error as { code?: unknown; meta?: { target?: unknown } };
    const target = prismaError?.meta?.target;
    return (
      prismaError?.code === 'P2002' &&
      (target === 'ref' ||
        (Array.isArray(target) && target.includes('ref')) ||
        (typeof target === 'string' && target.includes('ref')))
    );
  }

  /**
   * Store a safe diagnostic message, never a raw exception stack or credential.
   * The endpoint is public, so clients must not be relied upon to sanitize it.
   */
  private sanitizeMessage(message: string): string {
    return this.redactSensitiveValues(message.replace(/\r/g, '').split('\n')[0] ?? '', 2000);
  }

  private redactSensitiveValues(value: string, maxLength: number): string {
    return (
      value
        .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
        .replace(/\b(?:eyJ[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+){2})\b/g, '[REDACTED_JWT]')
        .replace(
          /\b(password|passwd|secret|token|authorization|cookie|api[_-]?key)\s*([:=])\s*[^\s,;]+/gi,
          '$1$2[REDACTED]',
        )
        // Diagnostic text must not persist terminal/control characters.
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .trim()
        .slice(0, maxLength)
    );
  }

  async create(
    dto: CreateErrorIncidentDto,
    principal: AuthUser | null,
    userAgent?: string,
  ): Promise<ErrorIncidentRow> {
    const vendor =
      principal?.role === UserRole.vendor
        ? await this.prisma.vendor.findUnique({
            where: { userId: principal.id },
            select: { id: true },
          })
        : null;

    const data = {
      app: dto.app,
      route: dto.route,
      message: this.sanitizeMessage(dto.message),
      digest: dto.digest ?? null,
      vendorId: vendor?.id ?? null,
      userId: principal?.id ?? null,
      // These deliberately have no relations and are only a sanitized UUID
      // supplied by the client. They cannot influence ownership.
      clientVendorId: dto.vendorId ?? null,
      clientUserId: dto.userId ?? null,
      userAgent: userAgent ? this.redactSensitiveValues(userAgent, 500) : null,
    };

    let incident: ErrorIncidentRow | null = null;
    for (let attempt = 0; attempt < MAX_REF_INSERT_ATTEMPTS; attempt += 1) {
      const ref = this.generateRef();
      try {
        incident = await this.prisma.errorIncident.create({
          data: { id: randomBytes(18).toString('base64url'), ref, ...data },
        });
        break;
      } catch (error) {
        if (!this.isRefCollision(error) || attempt === MAX_REF_INSERT_ATTEMPTS - 1) throw error;
      }
    }
    if (!incident) {
      throw new InternalServerErrorException('Could not allocate incident reference');
    }

    this.logger.warn(
      `Error incident ${incident.ref}: [${dto.app}] ${dto.route} : ${data.message.slice(0, 120)}`,
    );

    Sentry.captureMessage(`Error incident ${incident.ref}`, {
      level: 'error',
      extra: {
        ref: incident.ref,
        app: dto.app,
        route: dto.route,
        digest: dto.digest,
        vendorId: vendor?.id ?? null,
        userId: principal?.id ?? null,
      },
    });

    return incident;
  }

  async findByRef(ref: string): Promise<ErrorIncidentRow | null> {
    return this.prisma.errorIncident.findUnique({ where: { ref } });
  }

  async listRecent(limit = 50): Promise<ErrorIncidentRow[]> {
    return this.prisma.errorIncident.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Returns routes that have logged more than `threshold` incidents in the
   * last hour. Called by the DlqMonitorService cron for alerting.
   */
  async hotRoutes(
    thresholdPerHour = 3,
  ): Promise<Array<{ app: string; route: string; count: number }>> {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const groups = await this.prisma.errorIncident.groupBy({
      by: ['app', 'route'],
      where: { createdAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    return groups
      .filter((g) => g._count.id >= thresholdPerHour)
      .map((g) => ({ app: g.app, route: g.route, count: g._count.id }));
  }
}
