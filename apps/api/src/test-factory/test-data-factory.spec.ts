import {
  assertSafeDatabaseUrl,
  assertSafeSupabaseUrl,
  currentVendorTermsQuery,
  factoryManifest,
  FACTORY_STATE_CONTRACTS,
  FACTORY_STATES,
  groupUniqueStorageObjects,
  resolveSupabaseUrl,
  TestDataFactory,
} from '../../../../scripts/test-factory';

describe('test data factory safety guard', () => {
  it('accepts a local or ephemeral database URL', () => {
    expect(() =>
      assertSafeDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:5432/feastpot_test'),
    ).not.toThrow();
  });

  it('rejects a production-looking database URL', () => {
    expect(() =>
      assertSafeDatabaseUrl('postgresql://postgres:secret@db.production.example/feastpot'),
    ).toThrow('TEST_FACTORY_PRODUCTION_GUARD');
  });

  it('rejects the known production project reference in pooler database URLs', () => {
    expect(() =>
      assertSafeDatabaseUrl(
        'postgresql://postgres.yeklvhoqanxnogjnhkui:secret@aws-0-eu-west-2.pooler.supabase.com:6543/postgres',
      ),
    ).toThrow('TEST_FACTORY_PRODUCTION_GUARD');
  });

  it('requires an explicit target database', () => {
    expect(() => assertSafeDatabaseUrl(undefined)).toThrow('TEST_FACTORY_DATABASE_REQUIRED');
  });

  it('rejects configured or production-looking Supabase targets', () => {
    expect(() => assertSafeSupabaseUrl('https://production.example.supabase.co')).toThrow(
      'TEST_FACTORY_PRODUCTION_GUARD',
    );
  });

  it('cannot bypass the database guard by injecting Prisma', () => {
    expect(
      () =>
        new TestDataFactory({
          databaseUrl: 'postgresql://postgres:secret@db.production.example/feastpot',
          prisma: {} as never,
        }),
    ).toThrow('TEST_FACTORY_PRODUCTION_GUARD');
  });

  it('uses the browser Supabase target before the server target unless explicitly set', () => {
    const environment = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://browser-project.supabase.co/rest/v1/',
      SUPABASE_URL: 'https://server-project.supabase.co',
    };
    expect(resolveSupabaseUrl(undefined, environment)).toBe(
      'https://browser-project.supabase.co/rest/v1/',
    );
    expect(resolveSupabaseUrl('https://explicit-project.supabase.co', environment)).toBe(
      'https://explicit-project.supabase.co',
    );
  });

  it('selects the same newest effective terms version as the route gate', () => {
    const now = new Date('2030-01-02T00:00:00.000Z');
    expect(currentVendorTermsQuery(now)).toEqual({
      where: {
        documentType: 'VENDOR_TERMS',
        effectiveAt: { lte: now },
      },
      orderBy: [{ effectiveAt: 'desc' }, { publishedAt: 'desc' }],
    });
  });

  it('reuses an effective platform terms version without creating namespace churn', async () => {
    const prisma = {
      termsVersion: {
        findFirst: jest.fn().mockResolvedValue({ id: 'platform-current', contentHash: 'hash' }),
        upsert: jest.fn(),
      },
      termsAcceptance: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const factory = new TestDataFactory({
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:5432/feastpot_test',
      prisma: prisma as never,
      namespace: 'matrix',
    });

    await (
      factory as unknown as { ensureCurrentTerms(vendorId: string): Promise<unknown> }
    ).ensureCurrentTerms('vendor-id');

    expect(prisma.termsVersion.upsert).not.toHaveBeenCalled();
    expect(prisma.termsAcceptance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          vendorId_termsVersionId: { vendorId: 'vendor-id', termsVersionId: 'platform-current' },
        },
      }),
    );
  });
});

describe('test data factory contracts', () => {
  it('documents exactly one stable contract for every creatable state', () => {
    expect(Object.keys(FACTORY_STATE_CONTRACTS).sort()).toEqual([...FACTORY_STATES].sort());
    for (const state of FACTORY_STATES) {
      expect(FACTORY_STATE_CONTRACTS[state].length).toBeGreaterThan(0);
    }
  });

  it('emits credentials and all primary or related identifiers without configuration secrets', () => {
    const result = factoryManifest(
      {
        state: 'V5',
        credentials: { email: 'test@example.com', password: 'environment-value', role: 'vendor' },
        userId: 'user-id',
        vendorId: 'vendor-id',
        orderId: 'order-id',
        payoutId: 'payout-id',
        accessToken: 'session-secret-token',
        relatedUserIds: ['helper-user-id'],
        relatedVendorIds: ['helper-vendor-id'],
        storageObjects: [],
      },
      false,
    );
    expect(result).toMatchObject({
      state: 'V5',
      credentials: { email: 'test@example.com', password: 'environment-value' },
      ids: {
        userId: 'user-id',
        vendorId: 'vendor-id',
        orderId: 'order-id',
        payoutId: 'payout-id',
        relatedUserIds: ['helper-user-id'],
      },
      cleanedUp: false,
    });
    expect(result).not.toHaveProperty('accessToken');
    expect(JSON.stringify(result)).not.toContain('session-secret-token');
    expect(JSON.stringify(result)).not.toContain('SERVICE_ROLE');
  });

  it('groups duplicate storage paths before teardown removes them', () => {
    expect([
      ...groupUniqueStorageObjects([
        { bucket: 'feastpot-documents', path: 'test-factory/local/v1/a.pdf' },
        { bucket: 'feastpot-documents', path: 'test-factory/local/v1/a.pdf' },
        { bucket: 'feastpot-media', path: 'test-factory/local/v1/photo.jpg' },
      ]),
    ]).toEqual([
      ['feastpot-documents', ['test-factory/local/v1/a.pdf']],
      ['feastpot-media', ['test-factory/local/v1/photo.jpg']],
    ]);
  });
});
