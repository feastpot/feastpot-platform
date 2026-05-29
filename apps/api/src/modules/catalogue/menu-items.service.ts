import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InboxNotificationType, ModerationStatus, Prisma, UserRole } from '@prisma/client';

import type { AuthUser } from '../../auth/types';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InboxService } from '../inbox/inbox.service';

import {
  DIETARY_FLAG_SET,
  FSA_14_ALLERGENS,
  FSA_14_ALLERGEN_SET,
  PORTION_TAG_PREFIX,
  SPICE_TAG_PREFIX,
} from './catalogue.constants';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { ListMenuItemsDto } from './dto/list-menu-items.dto';
import { ListMenuModerationDto } from './dto/list-menu-moderation.dto';
import { ModerateMenuItemDto } from './dto/moderate-menu-item.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { SupabaseStorageService, type UploadedImage } from './supabase-storage.service';

/**
 * Moderation states a customer is allowed to see. `held` (awaiting review) and
 * `rejected` are hidden from the public PWA even when isAvailable=true.
 */
const PUBLIC_MODERATION_STATUSES: ModerationStatus[] = [
  ModerationStatus.auto_approved,
  ModerationStatus.approved,
];

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
    private readonly config: ConfigService,
    private readonly inbox: InboxService,
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
      // Approval gate: customers never see items still held for moderation or
      // rejected, even if the vendor has flipped them to available.
      where.moderationStatus = { in: PUBLIC_MODERATION_STATUSES };
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
    // Drafts AND items still awaiting moderation (held / rejected) must not
    // leak to customers via direct id lookup. Owner / admin / compliance
    // bypass the gate; everyone else gets a 404 (NOT 403 - we refuse to
    // confirm the item exists at all).
    const publiclyVisible =
      item.isAvailable && PUBLIC_MODERATION_STATUSES.includes(item.moderationStatus);
    if (!publiclyVisible) {
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

    // Approval gate. Default (MENU_AUTO_APPROVE unset or anything but the
    // literal string 'false') auto-approves uploads - safe for a vetted
    // founding cohort. Set MENU_AUTO_APPROVE=false before opening self-serve
    // signup so new items land as `held` and require admin approval first.
    const autoApprove = this.config.get<string>('MENU_AUTO_APPROVE') !== 'false';
    const moderationStatus = autoApprove
      ? ModerationStatus.auto_approved
      : ModerationStatus.held;

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
        moderationStatus,
        // Honour the explicit publish state from the DTO so vendors can save
        // drafts. Falls back to the schema default (false) when omitted.
        ...(dto.isAvailable !== undefined ? { isAvailable: dto.isAvailable } : {}),
      },
    });
    await this.invalidateVendorCache(vendorId);
    // Held items need a human - ping admins so the moderation queue doesn't
    // rely on polling. Fire-and-forget: notify failures never block creation.
    if (created.moderationStatus === ModerationStatus.held) {
      await this.notifyAdminsOfPendingItem(created.id, created.name, vendorId);
    }
    return created;
  }

  // -------------------- moderation (admin) --------------------

  /**
   * Paginated moderation queue for the admin panel. Mirrors the reviews queue:
   * cursor pagination (createdAt desc, id desc tie-break), filtered total for
   * the footer, vendor relation embedded so the table can show who uploaded it.
   * Omitted status defaults to `held` (the items actually awaiting a decision).
   */
  async listModerationQueue(dto: ListMenuModerationDto) {
    const limit = dto.limit ?? 20;
    const cursor = dto.cursor ? this.decodeCursor(dto.cursor) : undefined;
    const cursorWhere: Prisma.MenuItemWhereInput = cursor
      ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }
      : {};
    const baseWhere = this.buildModerationFilters(dto);
    const rows = await this.prisma.menuItem.findMany({
      where: { AND: [baseWhere, cursorWhere] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        vendor: { select: { id: true, businessName: true, slug: true, logoUrl: true } },
      },
    });
    const total = await this.prisma.menuItem.count({ where: baseWhere });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      data: page,
      total,
      nextCursor: hasMore && last ? this.encodeCursor(last) : null,
    };
  }

  /** Counts per moderation status, honouring all non-status filters. */
  async moderationQueueCounts(dto: ListMenuModerationDto) {
    const { status: _status, ...rest } = dto;
    const baseWhere = this.buildModerationFilters({ ...rest, status: 'all' });
    const grouped = await this.prisma.menuItem.groupBy({
      by: ['moderationStatus'],
      where: baseWhere,
      _count: { _all: true },
    });
    const counts: Record<ModerationStatus, number> & { all: number } = {
      auto_approved: 0,
      held: 0,
      approved: 0,
      rejected: 0,
      all: 0,
    };
    for (const g of grouped) {
      counts[g.moderationStatus] = g._count._all;
      counts.all += g._count._all;
    }
    return counts;
  }

  private buildModerationFilters(dto: ListMenuModerationDto): Prisma.MenuItemWhereInput {
    const filterStatus = dto.status ?? ModerationStatus.held;
    const where: Prisma.MenuItemWhereInput = {};
    if (filterStatus !== 'all') {
      where.moderationStatus = filterStatus as ModerationStatus;
    }
    if (dto.vendorId) where.vendorId = dto.vendorId;
    if (dto.q && dto.q.trim().length > 0) {
      const q = dto.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { vendor: { businessName: { contains: q, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  /**
   * Approve or reject (or re-hold) a menu item. Approval makes the item
   * eligible for the public PWA (subject to isAvailable); rejection / hold
   * keep it hidden. Cache is busted so the customer site reflects the change.
   */
  async moderate(itemId: string, dto: ModerateMenuItemDto, user: AuthUser) {
    const allowed: ModerationStatus[] = [
      ModerationStatus.approved,
      ModerationStatus.rejected,
      ModerationStatus.held,
    ];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException({
        code: 'INVALID_MODERATION_STATUS',
        message: 'status must be approved, rejected, or held',
      });
    }
    const item = await this.prisma.menuItem.findUnique({
      where: { id: itemId },
      select: { id: true, vendorId: true, name: true },
    });
    if (!item) {
      throw new NotFoundException({ code: 'MENU_ITEM_NOT_FOUND', message: 'Menu item not found' });
    }

    const updated = await this.prisma.menuItem.update({
      where: { id: itemId },
      data: { moderationStatus: dto.status },
    });
    await this.invalidateVendorCache(item.vendorId);

    // Tell the vendor when their item is rejected so they can fix and resubmit.
    if (dto.status === ModerationStatus.rejected) {
      const vendor = await this.prisma.vendor.findUnique({
        where: { id: item.vendorId },
        select: { userId: true },
      });
      if (vendor) {
        await this.inbox.notify({
          userId: vendor.userId,
          type: InboxNotificationType.menu_item_rejected,
          title: 'Menu item rejected',
          body: dto.reason
            ? `"${item.name}" was not approved: ${dto.reason}`
            : `"${item.name}" was not approved by moderation.`,
          link: '/menu',
          metadata: { menuItemId: item.id, moderatedById: user.id },
        });
      }
    }
    return updated;
  }

  /** Notify every admin that a freshly-uploaded item is waiting for review. */
  private async notifyAdminsOfPendingItem(
    itemId: string,
    itemName: string,
    vendorId: string,
  ): Promise<void> {
    const [admins, vendor] = await Promise.all([
      this.prisma.user.findMany({ where: { role: UserRole.admin }, select: { id: true } }),
      this.prisma.vendor.findUnique({ where: { id: vendorId }, select: { businessName: true } }),
    ]);
    const vendorName = vendor?.businessName ?? 'A vendor';
    await Promise.all(
      admins.map((a) =>
        this.inbox.notify({
          userId: a.id,
          type: InboxNotificationType.generic,
          title: 'Menu item awaiting approval',
          body: `${vendorName} added "${itemName}", which needs moderation before it goes live.`,
          link: '/menus/queue',
          metadata: { menuItemId: itemId, vendorId },
        }),
      ),
    );
  }

  // ----- cursor helpers (createdAt + id, base64url JSON) -----
  private encodeCursor(row: { createdAt: Date; id: string }): string {
    return Buffer.from(
      JSON.stringify({ c: row.createdAt.toISOString(), id: row.id }),
      'utf8',
    ).toString('base64url');
  }
  private decodeCursor(s: string): { createdAt: Date; id: string } | undefined {
    try {
      const obj = JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as { c: string; id: string };
      return { createdAt: new Date(obj.c), id: obj.id };
    } catch {
      return undefined;
    }
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
