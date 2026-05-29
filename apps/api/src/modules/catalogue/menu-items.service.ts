import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';

import {
  DIETARY_FLAG_SET,
  FSA_14_ALLERGENS,
  FSA_14_ALLERGEN_SET,
  PORTION_TAG_PREFIX,
  SPICE_TAG_PREFIX,
} from './catalogue.constants';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { ListMenuItemsDto } from './dto/list-menu-items.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { SupabaseStorageService, type UploadedImage } from './supabase-storage.service';

/**
 * Schema deviations:
 *   - The schema MenuItem has no columns for `dietaryFlags`, `isHalal`,
 *     `spiceLevel`, `portionLabel`, or `prepTimeMinutes`. We encode them
 *     into `tags` (e.g. ['halal', 'vegan', 'spice:2', 'portion:family']) and
 *     convert prep minutes → `preparationHours` (rounded up).
 */
@Injectable()
export class MenuItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
    private readonly cache: RedisCacheService,
  ) {}

  static validateAllergens(allergens: string[] | undefined): string[] {
    const list = allergens ?? [];
    const unknown = list.filter((a) => !FSA_14_ALLERGEN_SET.has(a));
    if (unknown.length) {
      throw new BadRequestException({
        code: 'INVALID_ALLERGEN',
        message: `Unknown allergen(s): ${unknown.join(', ')}. Allowed: ${FSA_14_ALLERGENS.join(', ')}`,
      });
    }
    return list;
  }

  static validateDietaryFlags(flags: string[] | undefined): string[] {
    const list = flags ?? [];
    const unknown = list.filter((f) => !DIETARY_FLAG_SET.has(f));
    if (unknown.length) {
      throw new BadRequestException({
        code: 'INVALID_DIETARY_FLAG',
        message: `Unknown dietary flag(s): ${unknown.join(', ')}`,
      });
    }
    return list;
  }

  static buildTags(dto: Pick<CreateMenuItemDto, 'dietaryFlags' | 'isHalal' | 'spiceLevel' | 'portionLabel'>): string[] {
    const out = new Set<string>();
    for (const f of MenuItemsService.validateDietaryFlags(dto.dietaryFlags)) out.add(f);
    if (dto.isHalal) out.add('halal');
    if (typeof dto.spiceLevel === 'number') out.add(`${SPICE_TAG_PREFIX}${dto.spiceLevel}`);
    if (dto.portionLabel) out.add(`${PORTION_TAG_PREFIX}${dto.portionLabel}`);
    return Array.from(out);
  }

  async findByMenu(
    vendorId: string,
    menuId: string,
    filters: ListMenuItemsDto,
    caller: AuthUser | null = null,
  ) {
    await this.assertMenuBelongs(vendorId, menuId);
    const where: Prisma.MenuItemWhereInput = { menuId };
    if (filters.category) where.category = filters.category;

    // Draft visibility gate: only the vendor owner / admin / compliance may
    // see drafts. Public callers always get isAvailable=true regardless of
    // any filter they send (so a customer can't unmask drafts by passing
    // ?isAvailable=false). Owners may filter freely with the query param.
    const canSeeDrafts = await this.callerOwnsVendor(vendorId, caller);
    if (canSeeDrafts) {
      if (filters.isAvailable !== undefined) where.isAvailable = filters.isAvailable;
    } else {
      where.isAvailable = true;
    }

    const tagFilters: string[] = [];
    if (filters.isHalal === true) tagFilters.push('halal');
    if (filters.dietaryFlag) tagFilters.push(filters.dietaryFlag);
    if (tagFilters.length) where.tags = { hasEvery: tagFilters };

    return this.prisma.menuItem.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Persist a vendor's drag-to-reorder. `itemIds` is the full ordered list of
   * the menu's items; index 0 becomes sortOrder 1. We require the provided set
   * to match the menu's current items exactly so a partial/foreign payload can
   * never leave duplicate orders or touch another menu's rows. All updates run
   * in one transaction, then the cache is busted so the customer PWA reflects
   * the new order within seconds.
   */
  async reorder(vendorId: string, menuId: string, itemIds: string[]) {
    await this.assertMenuBelongs(vendorId, menuId);

    const existing = await this.prisma.menuItem.findMany({
      where: { menuId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((i) => i.id));
    const providedIds = new Set(itemIds);
    const sameSize = existingIds.size === providedIds.size;
    const sameMembers = itemIds.every((id) => existingIds.has(id));
    if (itemIds.length !== providedIds.size || !sameSize || !sameMembers) {
      throw new BadRequestException({
        code: 'INVALID_REORDER',
        message: 'itemIds must contain each of this menu\'s items exactly once.',
      });
    }

    await this.prisma.$transaction(
      itemIds.map((id, index) =>
        this.prisma.menuItem.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );
    await this.invalidateVendorCache(vendorId);

    return this.prisma.menuItem.findMany({
      where: { menuId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(
    vendorId: string,
    menuId: string,
    itemId: string,
    caller: AuthUser | null = null,
  ) {
    const item = await this.prisma.menuItem.findUnique({ where: { id: itemId } });
    if (!item || item.menuId !== menuId || item.vendorId !== vendorId) {
      throw new NotFoundException({ code: 'MENU_ITEM_NOT_FOUND', message: 'Menu item not found' });
    }
    // Drafts must not leak to customers via direct id lookup. Owner / admin /
    // compliance bypass the gate; everyone else gets a 404 (NOT 403 - we
    // refuse to confirm the item exists at all).
    if (!item.isAvailable) {
      const canSeeDrafts = await this.callerOwnsVendor(vendorId, caller);
      if (!canSeeDrafts) {
        throw new NotFoundException({ code: 'MENU_ITEM_NOT_FOUND', message: 'Menu item not found' });
      }
    }
    return item;
  }

  /**
   * True if `caller` is the vendor's owning user, an admin, or compliance.
   * Used by public read endpoints to decide whether drafts are visible.
   */
  private async callerOwnsVendor(vendorId: string, caller: AuthUser | null): Promise<boolean> {
    if (!caller) return false;
    if (caller.role === UserRole.admin || caller.role === UserRole.compliance) return true;
    if (caller.role !== UserRole.vendor) return false;
    const owner = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { userId: true },
    });
    return owner?.userId === caller.id;
  }

  async create(vendorId: string, menuId: string, dto: CreateMenuItemDto) {
    await this.assertMenuBelongs(vendorId, menuId);
    const allergens = MenuItemsService.validateAllergens(dto.allergens);
    // Apply create-time defaults here rather than on the DTO so PATCH (PartialType)
    // does not silently overwrite stored values with defaults on omitted fields.
    const tags = MenuItemsService.buildTags({
      dietaryFlags: dto.dietaryFlags,
      isHalal: dto.isHalal ?? false,
      spiceLevel: dto.spiceLevel ?? 0,
      portionLabel: dto.portionLabel,
    });
    const preparationHours = Math.max(1, Math.ceil(dto.prepTimeMinutes / 60));

    // New items go to the end of the menu's current order so drag-to-reorder
    // starts from a sensible, gap-free position.
    const maxOrder = await this.prisma.menuItem.aggregate({
      where: { menuId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? 0) + 1;

    const created = await this.prisma.menuItem.create({
      data: {
        vendorId,
        menuId,
        name: dto.name,
        description: dto.description ?? null,
        category: dto.category,
        pricePence: dto.basePricePence,
        servingsCount: dto.servingsCount ?? null,
        preparationHours,
        imageUrls: dto.images ?? [],
        allergens,
        tags,
        sortOrder,
        // Honour the explicit publish state from the DTO so vendors can save
        // drafts. Falls back to the schema default (false) when omitted.
        ...(dto.isAvailable !== undefined ? { isAvailable: dto.isAvailable } : {}),
      },
    });
    await this.invalidateVendorCache(vendorId);
    return created;
  }

  /**
   * Single source of truth for cache busting after any menu-item write.
   * Profile cache embeds the full menu tree; search cache surfaces dish
   * names via matched_dishes.
   */
  private async invalidateVendorCache(vendorId: string): Promise<void> {
    await this.cache.del(`vendors:profile:${vendorId}`);
    await this.cache.del(`vendors:menu:${vendorId}`);
    await this.cache.delByPattern('vendors:search:*');
  }

  async update(vendorId: string, menuId: string, itemId: string, dto: UpdateMenuItemDto) {
    const existing = await this.findOne(vendorId, menuId, itemId);
    const data: Prisma.MenuItemUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.basePricePence !== undefined) data.pricePence = dto.basePricePence;
    if (dto.servingsCount !== undefined) data.servingsCount = dto.servingsCount;
    if (dto.images !== undefined) data.imageUrls = dto.images;
    if (dto.allergens !== undefined) data.allergens = MenuItemsService.validateAllergens(dto.allergens);
    if (dto.prepTimeMinutes !== undefined) {
      data.preparationHours = Math.max(1, Math.ceil(dto.prepTimeMinutes / 60));
    }
    // Honour explicit publish-state changes from the editor's upsert payload.
    // (The dedicated /availability toggle endpoint is still the right call
    // for in-place flips, but the full upsert must not silently drop this.)
    if (dto.isAvailable !== undefined) data.isAvailable = dto.isAvailable;

    // Tag-encoded fields: if any of them is supplied, recompute the full tag set
    // by merging the supplied values with the previously-stored ones.
    const tagFieldsTouched =
      dto.dietaryFlags !== undefined ||
      dto.isHalal !== undefined ||
      dto.spiceLevel !== undefined ||
      dto.portionLabel !== undefined;
    if (tagFieldsTouched) {
      const prevTags = existing.tags;
      const prevSpice = prevTags.find((t) => t.startsWith(SPICE_TAG_PREFIX))?.slice(SPICE_TAG_PREFIX.length);
      const prevPortion = prevTags.find((t) => t.startsWith(PORTION_TAG_PREFIX))?.slice(PORTION_TAG_PREFIX.length);
      const prevDiet = prevTags.filter((t) => DIETARY_FLAG_SET.has(t));
      const prevHalal = prevTags.includes('halal');
      data.tags = MenuItemsService.buildTags({
        dietaryFlags: dto.dietaryFlags ?? prevDiet,
        isHalal: dto.isHalal ?? prevHalal,
        spiceLevel: dto.spiceLevel ?? (prevSpice ? Number(prevSpice) : undefined),
        portionLabel: dto.portionLabel ?? prevPortion,
      });
    }

    const updated = await this.prisma.menuItem.update({ where: { id: itemId }, data });
    await this.invalidateVendorCache(vendorId);
    return updated;
  }

  async delete(vendorId: string, menuId: string, itemId: string) {
    await this.findOne(vendorId, menuId, itemId);
    await this.prisma.menuItem.delete({ where: { id: itemId } });
    await this.invalidateVendorCache(vendorId);
    return { deleted: true };
  }

  async toggleAvailability(vendorId: string, menuId: string, itemId: string, isAvailable: boolean) {
    await this.findOne(vendorId, menuId, itemId);
    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { isAvailable },
    });
    // Real-time correctness: vendor flipping a dish to sold-out must show up
    // in the customer PWA within seconds.
    await this.invalidateVendorCache(vendorId);
    return updated;
  }

  async uploadImage(params: {
    vendorId: string;
    menuId: string;
    itemId: string;
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer };
  }): Promise<UploadedImage> {
    const item = await this.findOne(params.vendorId, params.menuId, params.itemId);
    const uploaded = await this.storage.uploadMenuItemImage({
      vendorId: params.vendorId,
      itemId: params.itemId,
      file: params.file,
    });
    const next = [...item.imageUrls, uploaded.publicUrl].slice(0, 5);
    await this.prisma.menuItem.update({
      where: { id: params.itemId },
      data: { imageUrls: next },
    });
    return uploaded;
  }

  private async assertMenuBelongs(vendorId: string, menuId: string): Promise<void> {
    const menu = await this.prisma.menu.findUnique({ where: { id: menuId }, select: { vendorId: true } });
    if (!menu) throw new NotFoundException({ code: 'MENU_NOT_FOUND', message: 'Menu not found' });
    if (menu.vendorId !== vendorId) {
      throw new ForbiddenException({
        code: 'MENU_VENDOR_MISMATCH',
        message: 'Menu does not belong to this vendor',
      });
    }
  }
}
