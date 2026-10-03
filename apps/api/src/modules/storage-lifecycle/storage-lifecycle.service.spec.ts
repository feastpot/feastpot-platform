import { StorageLifecycleService } from './storage-lifecycle.service';

describe('Storage lifecycle and report-only reconciliation', () => {
  const origin = 'https://lifecycle.supabase.co';
  const bucket = 'feastpot-documents';
  const path = 'vendors/test/document.pdf';
  const locator = `${bucket}/${path}`;
  let objects: Set<string>;
  let refs: Array<{ locator: string; owner_table: string; owner_id: string }>;
  let jobs: Set<string>;
  let reportData: Record<string, unknown>;
  let db: { $executeRaw: jest.Mock; $queryRaw: jest.Mock };
  let remove: jest.Mock;
  let exists: jest.Mock;
  let service: StorageLifecycleService;

  beforeEach(() => {
    objects = new Set([locator]);
    refs = [];
    jobs = new Set();
    db = {
      $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        if (sql.includes('INSERT INTO public.storage_cleanup_jobs')) jobs.add(String(values[0]));
        if (sql.includes('DELETE FROM public.storage_cleanup_jobs')) jobs.delete(String(values[0]));
        return 1;
      }),
      $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('?');
        if (sql.includes('storage_object_references')) return refs;
        if (sql.includes('SELECT name FROM storage.objects'))
          return objects.has(`${values[0]}/${values[1]}`) ? [{ name: values[1] }] : [];
        if (sql.includes('SELECT bucket_id'))
          return [...objects].map((key) => ({
            bucket_id: key.split('/')[0],
            name: key.split('/').slice(1).join('/'),
          }));
        if (sql.includes('INSERT INTO public.storage_reconciliation_reports')) {
          reportData = JSON.parse(String(values[0]));
          return [{ id: 'saved-report' }];
        }
        if (sql.includes('storage_cleanup_jobs'))
          return [...jobs].map((key) => ({ locator: key, reason: 'failed_upload', attempts: 0 }));
        return [];
      }),
    };
    remove = jest.fn(async (paths: string[]) => {
      for (const p of paths) objects.delete(`${bucket}/${p}`);
      return { error: null };
    });
    exists = jest.fn(async (p: string) => ({ data: objects.has(`${bucket}/${p}`), error: null }));
    service = new StorageLifecycleService(
      db as never,
      {
        getClient: () => ({
          storage: {
            from: (b: string) => ({
              remove,
              exists,
              download: jest.fn(async (p: string) =>
                objects.has(`${bucket}/${p}`)
                  ? { data: 'bytes', error: null }
                  : { data: null, error: { status: 400, statusCode: '404' } },
              ),
              getPublicUrl: (p: string) => ({
                data: { publicUrl: `${origin}/storage/v1/object/public/${b}/${p}` },
              }),
            }),
          },
        }),
      } as never,
    );
  });

  it('records cleanup intent before any upload can run and clears it after a committed reference', async () => {
    await service.reserve(bucket, path);
    expect(jobs.has(locator)).toBe(true);
    refs.push({ locator, owner_table: 'vendor_documents', owner_id: 'new' });
    await service.committed(bucket, path);
    expect(jobs.has(locator)).toBe(false);
    expect(objects.has(locator)).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });

  it.each(['replacement', 'record deletion', 'failed database write', 'partial batch failure'])(
    '%s deletes the unreferenced object and verifies it is no longer retrievable',
    async () => {
      await service.reserve(bucket, path);
      expect(await service.compensate(bucket, path)).toBe(true);
      expect(objects.has(locator)).toBe(false);
      expect(remove).toHaveBeenCalledWith([path]);
      expect(exists).toHaveBeenCalledWith(path);
      expect(jobs.has(locator)).toBe(false);
    },
  );

  it('retains durable cleanup intent with a retry time when object deletion fails', async () => {
    remove.mockResolvedValueOnce({ error: new Error('Provider temporarily unavailable') });
    await service.reserve(bucket, path);
    expect(await service.compensate(bucket, path)).toBe(false);
    expect(jobs.has(locator)).toBe(true);
    expect(objects.has(locator)).toBe(true);
    expect(db.$executeRaw.mock.calls.some(([sql]) => sql.join('').includes('last_error'))).toBe(
      true,
    );
    expect(await service.compensate(bucket, path)).toBe(true);
    expect(objects.has(locator)).toBe(false);
  });

  it('does not claim success when the provider acknowledges deletion but the file still exists', async () => {
    remove.mockResolvedValueOnce({ error: null });
    await service.reserve(bucket, path);
    expect(await service.compensate(bucket, path)).toBe(false);
    expect(jobs.has(locator)).toBe(true);
    expect(objects.has(locator)).toBe(true);
  });
  it('handles Supabase HEAD returning generic 400 only when GET confirms structured 404', async () => {
    exists.mockResolvedValueOnce({ data: null, error: new Error('Bad Request') });
    await service.reserve(bucket, path);
    expect(await service.compensate(bucket, path)).toBe(true);
    expect(jobs.has(locator)).toBe(false);
  });

  it('protects another row referencing the same private object, including a signed URL alias', async () => {
    refs.push({
      locator: `${origin}/storage/v1/object/sign/${locator}?token=private`,
      owner_table: 'vendor_applications',
      owner_id: 'other',
    });
    await service.reserve(bucket, path);
    expect(await service.compensate(bucket, path)).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    expect(objects.has(locator)).toBe(true);
  });

  it('leaves a pre-upload reservation intact if the database becomes unavailable', async () => {
    await service.reserve(bucket, path);
    db.$executeRaw.mockRejectedValueOnce(new Error('Database offline'));
    expect(await service.compensate(bucket, path)).toBe(false);
    expect(jobs.has(locator)).toBe(true);
    expect(objects.has(locator)).toBe(true);
  });

  it('reports seeded orphans AND missing objects, persists the report and does not delete either', async () => {
    refs.push({
      locator: `${bucket}/missing.pdf`,
      owner_table: 'vendor_documents',
      owner_id: 'missing-row',
    });
    const report = await service.report();
    expect(report).toMatchObject({
      mode: 'report_only',
      orphanCount: 1,
      missingCount: 1,
      orphaned: [{ bucket_id: bucket, name: path }],
      missing: [expect.objectContaining({ owner_id: 'missing-row', path: 'missing.pdf' })],
    });
    expect(reportData!).toMatchObject({ mode: 'report_only', orphanCount: 1, missingCount: 1 });
    expect(objects.has(locator)).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    expect(jobs.size).toBe(0);
  });

  it('includes pending cleanup in the report without treating reporting as deletion approval', async () => {
    await service.reserve(bucket, path);
    const report = await service.report();
    expect(report.pendingCleanup).toContainEqual(expect.objectContaining({ locator }));
    expect(remove).not.toHaveBeenCalled();
  });

  it('never deletes an external URL or a URL for a different Supabase project', async () => {
    expect(
      service.parse(`https://other.supabase.co/storage/v1/object/public/${locator}`),
    ).toBeNull();
    expect(service.parse('https://photos.example/test.jpg')).toBeNull();
  });
});
