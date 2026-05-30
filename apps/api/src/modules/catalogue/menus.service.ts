import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';

import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

@Injectable()
export class MenusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  /**
   * Bust the cached vendor profile (which embeds the menu tree via
   * VendorRepository.findById) and any search-result keys (matched_dishes
   * surfaces menu data in search hits). Centralised so every menu/menu-item
   * write path can share the exact same invalidation set.
   */
  private async invalidateVendorCache(vendorId: string): Promise<void> {
    await this.cache.del(`vendors:profile:${vendorId}`);
    await this.cache.del(`vendors:menu:${vendorId}`);
    await this.cache.delByPattern('vendors:search:*');
  }

  /**
   * If `includeInactive=true` is requested but the caller is not the vendor
   * owner / admin / compliance, we silently downgrade to `includeInactive=false`
   * rather than erroring. That keeps the public endpoint forgiving while
   * preventing customers from probing inactive menus.
   */
  async findByVendor(vendorId: string, includeInactive = false, caller: AuthUser | null = null) {
    let allowInactive = false;
    if (includeInactive && caller) {
      if (caller.role === UserRole.admin || caller.role === UserRole.compliance) {
        allowInactive = true;
      } else if (caller.role === UserRole.vendor) {
        const owner = await this.prisma.vendor.findUnique({
          where: { id: vendorId },
          select: { userId: true },
        });
        allowInactive = owner?.userId === caller.id;
      }
    }
    return this.prisma.menu.findMany({
      where: { vendorId, ...(allowInactive ? {} : { isActive: true }) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
  }

  async findOne(vendorId: string, menuId: string) {
    const menu = await this.prisma.menu.findUnique({
      where: { id: menuId },
      include: { _count: { select: { items: true } } },
    });
    if (!menu || menu.vendorId !== vendorId) {
      throw new NotFoundException({ code: 'MENU_NOT_FOUND', message: 'Menu not found' });
    }
    return menu;
  }

  async create(vendorId: string, dto: CreateMenuDto) {
    const menu = await this.prisma.menu.create({
      data: {
        vendorId,
        name: dto.name,
        // Defaults applied here (not on the DTO) so that PartialType-derived
        // UpdateMenuDto does not silently re-impose them on PATCH.
        isActive: dto.isActive ?? true,
        sortOrder: dto.displayOrder ?? 0,
      },
    });
    await this.invalidateVendorCache(vendorId);
    return menu;
  }

  async update(vendorId: string, menuId: string, dto: UpdateMenuDto) {
    await this.assertBelongs(vendorId, menuId);
    const menu = await this.prisma.menu.update({
      where: { id: menuId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.displayOrder !== undefined ? { sortOrder: dto.displayOrder } : {}),
      },
    });
    await this.invalidateVendorCache(vendorId);
    return menu;
  }

  /**
   * Persist a vendor's drag-to-reorder of whole menus. `menuIds` is the full
   * ordered list of the vendor's menus; mirrors MenuItemsService.reorder. We
   * validate it contains each menu exactly once (no partial / foreign IDs)
   * before rewriting sortOrder in a single transaction, then bust the cache.
   */
  async reorder(vendorId: string, menuIds: string[]) {
    const existing = await this.prisma.menu.findMany({
      where: { vendorId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((m) => m.id));
    const providedIds = new Set(menuIds);
    const sameSize = existingIds.size === providedIds.size;
    const sameMembers = menuIds.every((id) => existingIds.has(id));
    if (menuIds.length !== providedIds.size || !sameSize || !sameMembers) {
      throw new BadRequestException({
        code: 'INVALID_REORDER',
        message: 'menuIds must contain each of this vendor\'s menus exactly once.',
      });
    }

    await this.prisma.$transaction(
      menuIds.map((id, index) =>
        this.prisma.menu.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );
    await this.invalidateVendorCache(vendorId);

    return this.prisma.menu.findMany({
      where: { vendorId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
  }

  async delete(vendorId: string, menuId: string) {
    await this.assertBelongs(vendorId, menuId);
    const itemCount = await this.prisma.menuItem.count({ where: { menuId } });
    if (itemCount > 0) {
      throw new ConflictException({
        code: 'MENU_NOT_EMPTY',
        message: `Cannot delete menu - it still contains ${itemCount} item(s). Remove or move them first.`,
      });
    }
    await this.prisma.menu.delete({ where: { id: menuId } });
    await this.invalidateVendorCache(vendorId);
    return { deleted: true };
  }

  private async assertBelongs(vendorId: string, menuId: string): Promise<void> {
    const menu = await this.prisma.menu.findUnique({ where: { id: menuId }, select: { vendorId: true } });
    if (!menu) {
      throw new NotFoundException({ code: 'MENU_NOT_FOUND', message: 'Menu not found' });
    }
    if (menu.vendorId !== vendorId) {
      throw new ForbiddenException({
        code: 'MENU_VENDOR_MISMATCH',
        message: 'Menu does not belong to this vendor',
      });
    }
  }
}
