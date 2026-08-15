import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { AuthUser } from '../../auth/types';

import { MenuItemsService } from './menu-items.service';

describe('MenuItemsService allergen + tag helpers', () => {
  describe('validateAllergens', () => {
    it('accepts an empty list', () => {
      expect(MenuItemsService.validateAllergens(undefined)).toEqual([]);
      expect(MenuItemsService.validateAllergens([])).toEqual([]);
    });

    it('accepts all 14 FSA allergens (canonical slugs)', () => {
      expect(() =>
        MenuItemsService.validateAllergens([
          'celery',
          'cereals-containing-gluten',
          'crustaceans',
          'eggs',
          'fish',
          'lupin',
          'milk',
          'molluscs',
          'mustard',
          'nuts',
          'peanuts',
          'sesame',
          'soya',
          'sulphur-dioxide',
        ]),
      ).not.toThrow();
    });

    it('rejects old non-canonical slugs (gluten, tree_nuts, soybeans, sulphites)', () => {
      for (const badSlug of ['gluten', 'tree_nuts', 'soybeans', 'sulphites']) {
        expect(() => MenuItemsService.validateAllergens([badSlug])).toThrow(BadRequestException);
      }
    });

    it('rejects an unknown allergen with BadRequest containing the bad value', () => {
      try {
        MenuItemsService.validateAllergens(['cereals-containing-gluten', 'unicorn-tears', 'eggs']);
        fail('expected throw');
      } catch (err) {
        expect(err).toBeInstanceOf(BadRequestException);
        const body = (err as BadRequestException).getResponse() as {
          code: string;
          message: string;
        };
        expect(body.code).toBe('INVALID_ALLERGEN');
        expect(body.message).toContain('unicorn-tears');
      }
    });
  });

  describe('validateDietaryFlags', () => {
    it('rejects unknown flag', () => {
      expect(() => MenuItemsService.validateDietaryFlags(['vegan', 'paleo'])).toThrow(
        BadRequestException,
      );
    });

    it('accepts known flags', () => {
      expect(MenuItemsService.validateDietaryFlags(['vegan', 'gluten_free'])).toEqual([
        'vegan',
        'gluten_free',
      ]);
    });
  });

  describe('buildTags', () => {
    it('encodes halal/spice/portion + dietary flags into the tags array', () => {
      const tags = MenuItemsService.buildTags({
        dietaryFlags: ['vegan', 'gluten_free'],
        isHalal: true,
        spiceLevel: 2,
        portionLabel: 'family',
      });
      expect(tags).toEqual(
        expect.arrayContaining(['vegan', 'gluten_free', 'halal', 'spice:2', 'portion:family']),
      );
    });

    it('omits absent fields cleanly', () => {
      const tags = MenuItemsService.buildTags({});
      expect(tags).toEqual([]);
    });

    it('does not duplicate halal tag if both flag and dietaryFlags include it', () => {
      const tags = MenuItemsService.buildTags({ dietaryFlags: ['halal'], isHalal: true });
      expect(tags.filter((t) => t === 'halal').length).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// uploadImage - draft-item visibility gate (regression for caller=null bug)
// ---------------------------------------------------------------------------
// These tests exercise the live service constructor with jest-mocked injected
// dependencies so we don't need a database, storage bucket, or Redis.
// ---------------------------------------------------------------------------
describe('MenuItemsService.uploadImage - draft visibility', () => {
  const vendorId = 'vendor-uuid-1';
  const menuId = 'menu-uuid-1';
  const itemId = 'item-uuid-1';
  const ownerUserId = 'user-uuid-owner';

  /** A draft menu item (isAvailable=false) that belongs to vendorId/menuId. */
  const draftItem = {
    id: itemId,
    menuId,
    vendorId,
    name: 'Test item',
    isAvailable: false, // <-- draft
    moderationStatus: 'auto_approved',
    imageUrls: [] as string[],
    tags: [] as string[],
    pricePence: 1000,
    preparationHours: 4,
    allergens: [] as string[],
    servingsCount: null,
    sortOrder: 1,
    category: 'tray',
    description: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const uploadedUrl = 'https://storage.example.com/vendors/vendor-uuid-1/items/item-uuid-1/a.jpg';

  /** Minimal AuthUser shape the service actually reads (role + id). */
  function makeVendorCaller(userId: string): AuthUser {
    return { id: userId, role: UserRole.vendor } as AuthUser;
  }

  const fakeFile = {
    originalname: 'photo.jpg',
    mimetype: 'image/jpeg',
    size: 1024,
    buffer: Buffer.from('fake-image-data'),
  };

  let prisma: {
    menuItem: { findUnique: jest.Mock; update: jest.Mock };
    vendor: { findUnique: jest.Mock };
  };
  let storage: { uploadMenuItemImage: jest.Mock };
  let service: MenuItemsService;

  beforeEach(() => {
    prisma = {
      menuItem: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ ...draftItem, imageUrls: [uploadedUrl] }),
      },
      vendor: { findUnique: jest.fn() },
    };
    storage = { uploadMenuItemImage: jest.fn().mockResolvedValue({ publicUrl: uploadedUrl }) };

    service = new MenuItemsService(
      prisma as never,
      storage as never,
      {} as never, // RedisCacheService - not called by uploadImage
      {} as never, // ConfigService    - not called by uploadImage
      {} as never, // InboxService     - not called by uploadImage
    );
  });

  it('succeeds when the owning vendor uploads to a draft item', async () => {
    // findOne: item lookup
    prisma.menuItem.findUnique.mockResolvedValueOnce(draftItem);
    // callerOwnsVendor: vendor row lookup
    prisma.vendor.findUnique.mockResolvedValueOnce({ userId: ownerUserId });

    const result = await service.uploadImage({
      vendorId,
      menuId,
      itemId,
      caller: makeVendorCaller(ownerUserId),
      file: fakeFile,
    });

    expect(result).toEqual({ publicUrl: uploadedUrl });
    expect(storage.uploadMenuItemImage).toHaveBeenCalledWith(
      expect.objectContaining({ vendorId, itemId }),
    );
    // Image URL should be persisted
    expect(prisma.menuItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: itemId },
        data: expect.objectContaining({ imageUrls: [uploadedUrl] }),
      }),
    );
  });

  it('throws NotFoundException for a vendor who does not own the item (different userId)', async () => {
    prisma.menuItem.findUnique.mockResolvedValueOnce(draftItem);
    // callerOwnsVendor: vendor row is owned by ownerUserId, not the intruder
    prisma.vendor.findUnique.mockResolvedValueOnce({ userId: ownerUserId });

    // The intruder is a real vendor but has a different userId than the owner
    await expect(
      service.uploadImage({
        vendorId,
        menuId,
        itemId,
        caller: makeVendorCaller('intruder-user-id'),
        file: fakeFile,
      }),
    ).rejects.toThrow(NotFoundException);

    // Storage must never be called when authorization fails
    expect(storage.uploadMenuItemImage).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when caller is null - confirms the pre-fix behaviour is blocked', async () => {
    // The root cause of the original bug: uploadImage was called with
    // caller defaulting to null → callerOwnsVendor returned false → 404.
    // This test documents that null is correctly rejected (even though the
    // controller now always passes req.user, the service-level gate must
    // stay robust against a null being passed directly).
    prisma.menuItem.findUnique.mockResolvedValueOnce(draftItem);
    // callerOwnsVendor short-circuits on null without querying the vendor table
    // so we do NOT set up a vendor mock - any call to it should not happen.

    await expect(
      service.uploadImage({
        vendorId,
        menuId,
        itemId,
        caller: null as never, // simulate what the pre-fix code did
        file: fakeFile,
      }),
    ).rejects.toThrow(NotFoundException);

    expect(storage.uploadMenuItemImage).not.toHaveBeenCalled();
    // callerOwnsVendor returns false without hitting the DB for a null caller
    expect(prisma.vendor.findUnique).not.toHaveBeenCalled();
  });
});
