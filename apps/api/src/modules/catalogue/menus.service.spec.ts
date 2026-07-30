import { UserRole } from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import type { RedisCacheService } from '../../common/cache/redis-cache.service';
import type { PrismaService } from '../../prisma/prisma.service';

import { MenusService } from './menus.service';

/**
 * findByVendor gating: the per-menu `itemHealth` counts (items missing
 * photos / allergen info) are operational vendor data and must only be
 * attached for callers allowed to see inactive menus (owner / admin /
 * compliance). Public callers get the plain active-menu payload with no
 * extra aggregate queries.
 */
describe('MenusService.findByVendor itemHealth gating', () => {
  const menuRow = {
    id: 'm-1',
    vendorId: 'v-1',
    name: 'Main',
    isActive: true,
    _count: { items: 5 },
  };

  function makeService(overrides?: { ownerUserId?: string }) {
    const prisma = {
      menu: { findMany: jest.fn().mockResolvedValue([menuRow]) },
      menuItem: { groupBy: jest.fn() },
      vendor: {
        findUnique: jest.fn().mockResolvedValue({ userId: overrides?.ownerUserId ?? 'owner-1' }),
      },
    };
    const cache = {} as unknown as RedisCacheService;
    const service = new MenusService(prisma as unknown as PrismaService, cache);
    return { service, prisma };
  }

  it('public caller: no itemHealth, no aggregate queries', async () => {
    const { service, prisma } = makeService();
    const result = await service.findByVendor('v-1', false, null);
    expect(result[0]).not.toHaveProperty('itemHealth');
    expect(prisma.menuItem.groupBy).not.toHaveBeenCalled();
  });

  it('non-owner requesting includeInactive: silently downgraded, no itemHealth', async () => {
    const { service, prisma } = makeService({ ownerUserId: 'someone-else' });
    const caller = { id: 'not-owner', role: UserRole.vendor } as AuthUser;
    const result = await service.findByVendor('v-1', true, caller);
    expect(result[0]).not.toHaveProperty('itemHealth');
    expect(prisma.menuItem.groupBy).not.toHaveBeenCalled();
  });

  it('owner: itemHealth attached with zero-defaults for healthy menus', async () => {
    const { service, prisma } = makeService({ ownerUserId: 'owner-1' });
    // Only missing-images has a row for this menu; missing-allergens is empty
    // so the ?? 0 default must kick in.
    prisma.menuItem.groupBy
      .mockResolvedValueOnce([{ menuId: 'm-1', _count: { _all: 2 } }])
      .mockResolvedValueOnce([]);
    const caller = { id: 'owner-1', role: UserRole.vendor } as AuthUser;
    const result = (await service.findByVendor('v-1', true, caller)) as Array<
      typeof menuRow & { itemHealth: { missingImages: number; missingAllergens: number } }
    >;
    expect(result[0]!.itemHealth).toEqual({ missingImages: 2, missingAllergens: 0 });
    expect(prisma.menuItem.groupBy).toHaveBeenCalledTimes(2);
  });
});
