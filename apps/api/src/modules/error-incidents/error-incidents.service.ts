import { randomBytes } from 'crypto';

import { Injectable, Logger } from '@nestjs/common';
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
  createdAt: Date;
}

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

  async create(
    dto: CreateErrorIncidentDto,
    principal: AuthUser | null,
    userAgent?: string,
  ): Promise<ErrorIncidentRow> {
    const id = randomBytes(18).toString('base64url');
    const ref = this.generateRef();
    const vendor =
      principal?.role === UserRole.vendor
        ? await this.prisma.vendor.findUnique({
            where: { userId: principal.id },
            select: { id: true },
          })
        : null;

    const incident = await this.prisma.errorIncident.create({
      data: {
        id,
        ref,
        app: dto.app,
        route: dto.route,
        message: dto.message.slice(0, 2000),
        digest: dto.digest ?? null,
        vendorId: vendor?.id ?? null,
        userId: principal?.id ?? null,
        userAgent: userAgent ? userAgent.slice(0, 500) : null,
      },
    });

    this.logger.warn(
      `Error incident ${ref}: [${dto.app}] ${dto.route} :  ${dto.message.slice(0, 120)}`,
    );

    Sentry.captureMessage(`Error incident ${ref}`, {
      level: 'error',
      extra: {
        ref,
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
