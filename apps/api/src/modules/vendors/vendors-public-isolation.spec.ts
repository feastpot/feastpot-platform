import type { PrismaService } from '../../prisma/prisma.service';
import { VendorRepository } from './vendors.repository';

describe('public vendor isolation', () => {
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
});
