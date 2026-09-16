import type { PrismaService } from '../../prisma/prisma.service';

import type { SearchVendorsDto } from './dto/search-vendors.dto';
import { VendorRepository } from './vendors.repository';

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
        where: { slug: 'fixture', isSeedData: false, user: { isTestData: false } },
      }),
    );
  });
  it('applies the same exclusions to UUID lookup', async () => {
    const prisma: any = { vendor: { findFirst: jest.fn().mockResolvedValue(null) } };
    await new VendorRepository(prisma as PrismaService).findPublicById('id');
    expect(prisma.vendor.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'id', isSeedData: false, user: { isTestData: false } },
      }),
    );
  });

  it('allows isolated test-environment fixtures through public lookup', async () => {
    process.env.NODE_ENV = 'test';
    const prisma: any = { vendor: { findFirst: jest.fn().mockResolvedValue(null) } };
    await new VendorRepository(prisma as PrismaService).findBySlug('fixture');
    expect(prisma.vendor.findFirst).toHaveBeenCalledWith({
      where: { slug: 'fixture' },
    });
  });

  it('applies persisted fixture exclusions to public search outside tests', async () => {
    const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([]) };
    await new VendorRepository(prisma as PrismaService).search({} as SearchVendorsDto, null);
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    expect(query.strings.join(' ')).toContain('v.is_seed_data = false');
    expect(query.strings.join(' ')).toContain('owner.is_test_data = false');
  });

  it('allows isolated test-environment fixtures through public search', async () => {
    process.env.NODE_ENV = 'test';
    const prisma: any = { $queryRaw: jest.fn().mockResolvedValue([]) };
    await new VendorRepository(prisma as PrismaService).search({} as SearchVendorsDto, null);
    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    expect(query.strings.join(' ')).not.toContain('v.is_seed_data = false');
    expect(query.strings.join(' ')).not.toContain('owner.is_test_data = false');
  });
});
