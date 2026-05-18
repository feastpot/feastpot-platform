import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

function encodeDbUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  const v = raw.replace(/^"|"$/g, '').trim();
  // Split on the LAST '@' so passwords containing '@' (encoded or raw) are preserved.
  const atIdx = v.lastIndexOf('@');
  const schemeIdx = v.indexOf('://');
  if (atIdx < 0 || schemeIdx < 0) return v;
  const scheme = v.slice(0, schemeIdx + 3);
  const credsAndHost = v.slice(schemeIdx + 3);
  const credEnd = credsAndHost.lastIndexOf('@');
  const creds = credsAndHost.slice(0, credEnd);
  const hostPart = credsAndHost.slice(credEnd + 1);
  const colon = creds.indexOf(':');
  if (colon < 0) return v;
  const user = creds.slice(0, colon);
  const pwd = creds.slice(colon + 1);
  // Decode-then-encode to normalise: if already correctly encoded this is a no-op,
  // if raw special chars are present they get encoded. Falls back to raw encode if decode fails.
  let encPwd: string;
  try {
    encPwd = encodeURIComponent(decodeURIComponent(pwd));
  } catch {
    encPwd = encodeURIComponent(pwd);
  }
  return `${scheme}${user}:${encPwd}@${hostPart}`;
}

const datasourceUrl = encodeDbUrl(process.env.SUPABASE_DB_URL);

/**
 * Connection pool sizing:
 *   - Replit Autoscale: up to ~20 instances at peak.
 *   - Supabase Pro:     200 max_connections.
 *   - Per-instance pool: 5 connections via PgBouncer transaction pooling.
 *   - Total ceiling:    100 connections (50% headroom for migrations,
 *                        Studio, the BullMQ Redis path's own DB writes,
 *                        and ad-hoc psql sessions).
 *
 * The pool size + transaction pooling MUST be set in DATABASE_URL via env:
 *   DATABASE_URL=postgresql://…?pgbouncer=true&connection_limit=5&pool_timeout=20&connect_timeout=10
 * We deliberately do NOT mutate the env var here - it's a shared platform
 * secret and should be edited once in Replit Secrets, not per-process.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      ...(datasourceUrl ? { datasourceUrl } : {}),
      // Quiet in production: only warnings + errors are emitted to stdout.
      // Dev keeps `query` so slow-query work stays visible without extra
      // tooling.
      log:
        process.env.NODE_ENV === 'production'
          ? ['warn', 'error']
          : ['query', 'warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Prisma connected');
      // Best-effort connection-count probe - useful in production to confirm
      // the pool is sized as expected and that we aren't accidentally
      // running without PgBouncer. Failure here is non-fatal.
      try {
        const rows = await this.$queryRawUnsafe<{ active_connections: bigint }[]>(
          `SELECT count(*)::int8 as active_connections FROM pg_stat_activity WHERE application_name LIKE 'prisma%'`,
        );
        const n = rows?.[0]?.active_connections;
        if (n !== undefined) {
          this.logger.log(`Prisma active connections (this DB): ${Number(n)}`);
        }
      } catch {
        /* metrics-only - ignore on managed pools that block pg_stat_activity */
      }
    } catch (err) {
      this.logger.warn(`Prisma connect failed (continuing): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }
}
