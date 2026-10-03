import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { SupabaseService } from '../../auth/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';

const BUCKETS = ['feastpot-media', 'feastpot-documents'];
type Reference = { locator: string; owner_table: string; owner_id: string };
type Job = { locator: string; reason: string };
export type ObjectRef = { bucket: string; path: string };

@Injectable()
export class StorageLifecycleService {
  private readonly logger = new Logger(StorageLifecycleService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  parse(locator: string): ObjectRef | null {
    for (const bucket of BUCKETS) {
      if (locator.startsWith(`${bucket}/`))
        return { bucket, path: locator.slice(bucket.length + 1) };
    }
    try {
      const url = new URL(locator);
      const origin = new URL(
        this.supabase.getClient().storage.from(BUCKETS[0]).getPublicUrl('').data.publicUrl,
      ).origin;
      if (url.origin !== origin) return null;
      const match = url.pathname.match(
        /^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/,
      );
      if (!match || !BUCKETS.includes(match[1])) return null;
      return { bucket: match[1], path: decodeURIComponent(match[2]) };
    } catch {
      return null;
    }
  }

  private key(ref: ObjectRef): string {
    return `${ref.bucket}/${ref.path}`;
  }

  /** Persist intent BEFORE sending bytes. A crash/DB outage cannot lose this object. */
  async reserve(bucket: string, path: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO public.storage_cleanup_jobs(locator, reason, due_at)
      VALUES (${`${bucket}/${path}`}, 'uncommitted_upload', CURRENT_TIMESTAMP + interval '1 hour')
      ON CONFLICT(locator) DO NOTHING`;
  }

  async committed(bucket: string, path: string): Promise<void> {
    try {
      await this.prisma.$executeRaw`DELETE FROM public.storage_cleanup_jobs
        WHERE locator = ${`${bucket}/${path}`} AND reason = 'uncommitted_upload'`;
    } catch {
      // A committed reference protects this object on the next cleanup attempt.
      this.logger.warn('Upload cleanup reservation remains pending; reconciliation will check it.');
    }
  }

  async compensate(bucket: string, path: string): Promise<boolean> {
    const locator = `${bucket}/${path}`;
    try {
      await this.prisma.$executeRaw`INSERT INTO public.storage_cleanup_jobs(locator, reason)
        VALUES (${locator}, 'failed_upload') ON CONFLICT(locator)
        DO UPDATE SET due_at = CURRENT_TIMESTAMP, reason = 'failed_upload'`;
      return await this.process({ locator, reason: 'failed_upload' });
    } catch {
      // reserve() already recorded it before upload; do not delete if commit is uncertain.
      this.logger.error({ event: 'storage_cleanup_deferred', locator });
      return false;
    }
  }

  async references(): Promise<Reference[]> {
    return this.prisma.$queryRaw<Reference[]>`SELECT locator, owner_table, owner_id
      FROM public.storage_object_references`;
  }

  async process(job: Job): Promise<boolean> {
    const ref = this.parse(job.locator);
    if (!ref) {
      await this.prisma
        .$executeRaw`DELETE FROM public.storage_cleanup_jobs WHERE locator = ${job.locator}`;
      return true; // External links are never removed from our storage.
    }
    const claimed = await this.prisma.$executeRaw`UPDATE public.storage_cleanup_jobs
      SET locked_until = CURRENT_TIMESTAMP + interval '5 minutes', attempts = attempts + 1
      WHERE locator = ${job.locator} AND (locked_until IS NULL OR locked_until < CURRENT_TIMESTAMP)`;
    if (!claimed) return false;
    try {
      // Re-check ALL owners, not only the row which originally detached the URL.
      const referenced = (await this.references()).some((row) => {
        const other = this.parse(row.locator);
        return other && this.key(other) === this.key(ref);
      });
      if (!referenced) {
        const storage = this.supabase.getClient().storage.from(ref.bucket);
        const result = await storage.remove([ref.path]);
        if (result.error) throw result.error;
        const verification = await storage.exists(ref.path);
        if (verification.error) {
          // Some Supabase servers return HTTP 400 for an absent object on HEAD.
          // GET supplies the structured 404; never treat a generic 400 as proof of deletion.
          const download = await storage.download(ref.path);
          if (download.data) throw new Error('Storage object is still retrievable after deletion');
          const error = download.error as { statusCode?: string; status?: number } | null;
          if (!error || (error.statusCode !== '404' && error.status !== 404))
            throw download.error ?? verification.error;
        }
        if (verification.data)
          throw new Error('Storage object is still retrievable after deletion');
        // Verify metadata after the provider's real object-delete operation.
        const remaining = await this.prisma.$queryRaw<Array<{ name: string }>>`
          SELECT name FROM storage.objects WHERE bucket_id = ${ref.bucket} AND name = ${ref.path}`;
        if (remaining.length) throw new Error('Storage still contains the deleted object');
      }
      await this.prisma
        .$executeRaw`DELETE FROM public.storage_cleanup_jobs WHERE locator = ${job.locator}`;
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.prisma.$executeRaw`UPDATE public.storage_cleanup_jobs
        SET last_error = ${detail.slice(0, 2000)}, locked_until = NULL,
          due_at = CURRENT_TIMESTAMP + interval '5 minutes' WHERE locator = ${job.locator}`;
      this.logger.error({ event: 'storage_cleanup_failed', locator: job.locator, detail });
      return false;
    }
  }

  @Cron('*/5 * * * *')
  async drain(): Promise<void> {
    try {
      const jobs = await this.prisma.$queryRaw<
        Job[]
      >`SELECT locator, reason FROM public.storage_cleanup_jobs
        WHERE due_at <= CURRENT_TIMESTAMP AND (locked_until IS NULL OR locked_until < CURRENT_TIMESTAMP)
        ORDER BY due_at LIMIT 50`;
      for (const job of jobs) await this.process(job);
    } catch {
      this.logger.error({ event: 'storage_cleanup_scan_failed' });
    }
  }

  /** A separate inventory, never a cleanup input. First and subsequent runs are report-only. */
  @Cron('0 4 * * *', { timeZone: 'UTC' })
  async report() {
    const references = await this.references();
    const objects = await this.prisma.$queryRaw<Array<{ bucket_id: string; name: string }>>`
      SELECT bucket_id, name FROM storage.objects
      WHERE bucket_id IN ('feastpot-media', 'feastpot-documents')`;
    const objectKeys = new Set(objects.map((object) => `${object.bucket_id}/${object.name}`));
    const referenceKeys = new Set<string>();
    const missing: Array<Reference & ObjectRef> = [];
    for (const row of references) {
      const ref = this.parse(row.locator);
      if (!ref) continue;
      referenceKeys.add(this.key(ref));
      if (!objectKeys.has(this.key(ref))) missing.push({ ...row, locator: this.key(ref), ...ref });
    }
    const orphaned = objects.filter(
      (object) => !referenceKeys.has(`${object.bucket_id}/${object.name}`),
    );
    const pending = await this.prisma.$queryRaw<
      Array<{ locator: string; reason: string; attempts: number }>
    >`
      SELECT locator, reason, attempts FROM public.storage_cleanup_jobs ORDER BY created_at`;
    const data = {
      mode: 'report_only',
      objectCount: objects.length,
      referenceCount: references.length,
      orphanCount: orphaned.length,
      missingCount: missing.length,
      orphaned: orphaned.slice(0, 5000),
      missing: missing.slice(0, 5000),
      pendingCleanup: pending.slice(0, 5000),
      samplesTruncated: orphaned.length > 5000 || missing.length > 5000 || pending.length > 5000,
    };
    const [saved] = await this.prisma.$queryRaw<Array<{ id: string }>>`
      INSERT INTO public.storage_reconciliation_reports(data) VALUES (${JSON.stringify(data)}::jsonb) RETURNING id`;
    this.logger.log({
      event: 'storage_reconciliation_report',
      id: saved.id,
      orphanCount: orphaned.length,
      missingCount: missing.length,
    });
    return { id: saved.id, ...data };
  }

  async latest() {
    const [row] = await this.prisma.$queryRaw<
      Array<{ id: string; data: unknown; created_at: Date }>
    >`
      SELECT id, data, created_at FROM public.storage_reconciliation_reports ORDER BY created_at DESC LIMIT 1`;
    return row ?? null;
  }
}
