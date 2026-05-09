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

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super(datasourceUrl ? { datasourceUrl } : {});
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Prisma connected');
    } catch (err) {
      this.logger.warn(`Prisma connect failed (continuing): ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected');
  }
}
