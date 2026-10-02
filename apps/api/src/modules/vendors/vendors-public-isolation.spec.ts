import type { PrismaService } from '../../prisma/prisma.service';

import type { SearchVendorsDto } from './dto/search-vendors.dto';
import { isExplicitPublicDemo, isNonOrderableVendor } from './vendor-public-scope';
import { VendorRepository } from './vendors.repository';

describe('vendor public-demo provenance predicates', () => {
  it('requires the complete persisted provenance tuple for demo visibility', () => {
    const provenance = {
      publicDemo: true,
      isSeedData: false,
      user: { isTestData: true, provenance: 'nigerian-demo-vendor' },
    };
    expect(isExplicitPublicDemo(provenance)).toBe(true);
    expect(isExplicitPublicDemo({ ...provenance, isSeedData: true })).toBe(false);
    expect(
      isExplicitPublicDemo({
        ...provenance,
        user: { isTestData: true, provenance: 'other-fixture' },
      }),
    ).toBe(false);
  });

  it('keeps a flagged demo non-orderable in tests but permits ordinary test fixtures there', () => {
    expect(
      isNonOrderableVendor(
        { publicDemo: true, isSeedData: false, user: { isTestData: true } },
        'test',
      ),
    ).toBe(true);
    expect(isNonOrderableVendor({ isSeedData: true, user: { isTestData: true } }, 'test')).toBe(
      false,
    );
    expect(isNonOrderableVendor({ isSeedData: true }, 'production')).toBe(true);
  });
});

describe('public vendor isolation', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('applies seed and test-owner exclusions to slug lookup', async () => {
    const prisma: any = { vendor: { findFirst: jest.fn().mockResolvedValue(null) } };
    await new VendorRepository(prisma as PrismaService).findBySlug('fixture');
    expect(prisma.vendor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: 'fixture',
          OR: expect.arrayContaining([
            expect.objectContaining({
              isSeedData: false,
              user: { isTestData: false },
              status: 'live',
              approvedAt: { not: null },
              suspendedAt: null,
            }),
            expect.objectContaining({
              publicDemo: true,
              isSeedData: false,
              user: { isTestData: true, provenance: 'nigerian-demo-vendor' },
              suspendedAt: null,
            }),
          ]),
        }),
      }),
    );
  });
  it('applies the same exclusions to UUID lookup', async () => {
    const prisma: any = { vendor: { findFirst: jest.fn().mockResolvedValue(null) } };
    await new VendorRepository(prisma as PrismaService).findPublicById('id');
    expect(prisma.vendor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'id',
          OR: expect.arrayContaining([
            expect.objectContaining({
              isSeedData: false,
              user: { isTestData: false },
              status: 'live',
              approvedAt: { not: null },
              suspendedAt: null,
            }),
            expect.objectContaining({
              publicDemo: true,
              isSeedData: false,
              user: { isTestData: true, provenance: 'nigerian-demo-vendor' },
              suspendedAt: null,
            }),
          ]),
        }),
      }),
    );
  });

  it('loads inactive menus and held item photos only for an explicitly scoped public demo', async () => {
    const profile = {
      id: 'demo-id',
      publicDemo: true,
      isSeedData: false,
      user: { isTestData: true, provenance: 'nigerian-demo-vendor' },
    };
    const prisma: any = {
      vendor: {
        findFirst: jest.fn().mockResolvedValue(profile),
        findUnique: jest.fn().mockResolvedValue({
          id: 'demo-id',
          publicDemo: true,
          isSeedData: false,
          menus: [
            {
              isActive: false,
              items: [{ isAvailable: false, moderationStatus: 'held', imageUrls: ['demo-photo'] }],
            },
          ],
        }),
      },
    };

    const result = await new VendorRepository(prisma as PrismaService).findPublicById('demo-id');
    const include = prisma.vendor.findUnique.mock.calls[0][0].include;

    expect(include.menus).not.toHaveProperty('where');
    expect(include.menus.include.items).not.toHaveProperty('where');
    expect(result?.publicDemo).toBe(true);
    expect(result?.menus[0]?.items[0]?.imageUrls).toEqual(['demo-photo']);
    expect(result?.menus[0]?.items[0]?.moderationStatus).toBe('held');
  });

  it('allows isolated test-environment fixtures through public lookup', async () => {
    process.env.NODE_ENV = 'test';
    const prisma: any = { vendor: { findFirst: jest.fn().mockResolvedValue(null) } };
    await new VendorRepository(prisma as PrismaService).findBySlug('fixture');
    expect(prisma.vendor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'fixture' } }),
    );
  });

  it('applies persisted fixture exclusions to public search outside tests', async () => {
    const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([]) };
    await new VendorRepository(prisma as PrismaService).search({} as SearchVendorsDto, null);
    const query = prisma.$queryRaw.mock.calls[0][0] as {
      strings: readonly string[];
      values: readonly unknown[];
    };
    expect(query.strings.join(' ')).toContain('v.is_seed_data = false');
    expect(query.strings.join(' ')).toContain('owner.is_test_data = false');
    expect(query.strings.join(' ')).toContain('v.public_demo');
    expect(query.strings.join(' ')).toContain('owner.provenance');
    expect(query.values).toContain('nigerian-demo-vendor');
    expect(query.strings.join(' ')).toContain('AS public_demo');
    expect(query.strings.join(' ')).toContain('THEN NULL::float');
    expect(query.strings.join(' ')).toContain('v.suspended_at IS NULL');
  });

  it('allows isolated test-environment fixtures through public search', async () => {
    process.env.NODE_ENV = 'test';
    const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([]) };
    await new VendorRepository(prisma as PrismaService).search({} as SearchVendorsDto, null);
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    expect(query.strings.join(' ')).toContain('v.public_demo');
    expect(query.strings.join(' ')).not.toContain('owner.is_test_data = false');
  });
});
