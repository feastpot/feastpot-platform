import {
  Controller,
  Get,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiExcludeController } from '@nestjs/swagger';

import { Public } from './auth/decorators/public.decorator';
import { PrismaService } from './prisma/prisma.service';

/**
 * Version-neutral root controller. The rest of the API is mounted under
 * `/v1/...` via `app.enableVersioning(URI)`, but Cloud Run / autoscale's
 * default startup probe pings `GET /` and requires HTTP 200. Without this,
 * the probe gets a 404 from `HttpExceptionFilter`, fails enough times in a
 * row, and the Promote phase aborts - exactly the failure mode we just
 * debugged. Keeping the response tiny (no DB hit) means the probe stays
 * fast even under cold-start load.
 *
 * `GET /healthz` is a deeper liveness probe at an unversioned path: it pings
 * the database with `SELECT 1` and returns 503 if unreachable. External
 * monitoring (BetterStack, UptimeRobot, etc.) should hit this so a hung DB
 * connection actually pages us instead of silently looking healthy.
 */
// Probe routes (`/`, `/healthz`, `/livez`) are pinged continuously by the
// Autoscale load balancer. Rate-limiting them is pointless (they're public,
// fixed-cost liveness checks) and each throttled request costs 2 Redis INCRs
// (short + long window) - across N instances that burns through the Upstash
// request quota fast. Skipping the throttler here removes the single largest
// source of Redis traffic without weakening any real abuse protection.
@SkipThrottle()
@ApiExcludeController()
@Controller({ path: '', version: VERSION_NEUTRAL })
export class RootController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  root() {
    return {
      name: 'Feastpot API',
      status: 'ok',
      docs: '/v1/health',
      timestamp: new Date().toISOString(),
    };
  }

  @Public()
  @Get(['healthz', 'livez'])
  async healthz(): Promise<{ status: string; db: string; timestamp: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', db: 'ok', timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        db: 'unavailable',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
