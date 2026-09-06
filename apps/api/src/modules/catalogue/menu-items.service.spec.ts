import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ModerationStatus, UserRole } from '@prisma/client';

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
    vendorMember: { findFirst: jest.Mock };
    user: { findMany: jest.Mock };
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
      vendorMember: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    storage = { uploadMenuItemImage: jest.fn().mockResolvedValue({ publicUrl: uploadedUrl }) };

    service = new MenuItemsService(
      prisma as never,
      storage as never,
      { del: jest.fn(), delByPattern: jest.fn() } as never,
      {} as never, // ConfigService    - not called by uploadImage
      { notify: jest.fn() } as never,
      {} as never, // NotificationsService - not called by uploadImage
    );
  });

  it.each(['approved', 'auto_approved'])(
    're-holds a %s item when an image is uploaded',
    async (moderationStatus) => {
      prisma.menuItem.findUnique.mockResolvedValueOnce({
        ...draftItem,
        isAvailable: true,
        moderationStatus,
      });
      prisma.vendor.findUnique.mockResolvedValueOnce({ userId: ownerUserId });

      await service.uploadImage({
        vendorId,
        menuId,
        itemId,
        caller: makeVendorCaller(ownerUserId),
        file: fakeFile,
      });

      expect(prisma.menuItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: itemId },
          data: expect.objectContaining({
            imageUrls: [uploadedUrl],
            submissionVersion: { increment: 1 },
            moderationStatus: 'held',
            submittedAt: expect.any(Date),
            decidedAt: null,
            decisionReason: null,
            moderatedBy: { disconnect: true },
          }),
        }),
      );
    },
  );

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
        data: expect.objectContaining({
          imageUrls: [uploadedUrl],
          submissionVersion: { increment: 1 },
        }),
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

describe('MenuItemsService allergen publication scenarios', () => {
  const vendorId = 'vendor-1';
  const menuId = 'menu-1';
  const itemId = 'item-1';
  const baseDto = {
    name: 'Jollof rice',
    category: 'tray',
    basePricePence: 1200,
    prepTimeMinutes: 60,
  };

  function makeService(
    existing?: Partial<Record<string, unknown>>,
    menuAutoApprove: string | undefined = 'true',
  ) {
    const item = {
      id: itemId,
      vendorId,
      menuId,
      name: 'Jollof rice',
      description: null,
      category: 'tray',
      pricePence: 1200,
      servingsCount: null,
      preparationHours: 1,
      imageUrls: [],
      allergens: [],
      allergensFreeFrom: false,
      tags: [],
      sortOrder: 1,
      isAvailable: true,
      moderationStatus: 'approved',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...existing,
    };
    const prisma = {
      menu: { findUnique: jest.fn().mockResolvedValue({ vendorId }) },
      vendor: { findUnique: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      menuItem: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 0 } }),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...item, ...data })),
        findUnique: jest.fn().mockResolvedValue(item),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...item, ...data })),
      },
      menuItemAllergenRemediation: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops)),
    };
    const cache = { del: jest.fn(), delByPattern: jest.fn() };
    const service = new MenuItemsService(
      prisma as never,
      {} as never,
      cache as never,
      { get: jest.fn().mockReturnValue(menuAutoApprove) } as never,
      { notify: jest.fn() } as never,
      { enqueue: jest.fn() } as never,
    );
    return { service, prisma };
  }

  it('rejects publishing a new item with no declaration', async () => {
    const { service } = makeService();
    await expect(
      service.create(vendorId, menuId, {
        ...baseDto,
        allergens: [],
        allergensFreeFrom: false,
        isAvailable: true,
      }),
    ).rejects.toMatchObject({ response: { code: 'ALLERGEN_DECLARATION_REQUIRED' } });
  });

  it.each([
    { allergens: ['milk'], allergensFreeFrom: false },
    { allergens: [], allergensFreeFrom: true },
  ])('allows a declared new item: %o', async (declaration) => {
    const { service, prisma } = makeService();
    await service.create(vendorId, menuId, {
      ...baseDto,
      ...declaration,
      isAvailable: true,
    });
    expect(prisma.menuItem.create).toHaveBeenCalled();
  });

  it('fails closed to held unless MENU_AUTO_APPROVE is exactly "true"', async () => {
    const dto = { ...baseDto, allergens: ['milk'], isAvailable: true };
    const { service: defaultService, prisma: defaultPrisma } = makeService(
      undefined,
      null as never,
    );
    await defaultService.create(vendorId, menuId, dto);
    expect(defaultPrisma.menuItem.create.mock.calls[0][0].data).toMatchObject({
      moderationStatus: 'held',
      submittedAt: expect.any(Date),
    });

    const { service: optInService, prisma: optInPrisma } = makeService(undefined, 'TRUE');
    await optInService.create(vendorId, menuId, dto);
    expect(optInPrisma.menuItem.create.mock.calls[0][0].data.moderationStatus).toBe('held');

    const { service: automaticService, prisma: automaticPrisma } = makeService(undefined, 'true');
    await automaticService.create(vendorId, menuId, dto);
    expect(automaticPrisma.menuItem.create.mock.calls[0][0].data.moderationStatus).toBe(
      'auto_approved',
    );
  });

  it('re-holds substantive approved edits but not availability-only changes', async () => {
    const { service, prisma } = makeService({ allergens: ['milk'], moderationStatus: 'approved' });
    await service.update(vendorId, menuId, itemId, { name: 'Updated jollof' });
    expect(prisma.menuItem.update.mock.calls[0][0].data).toMatchObject({
      moderationStatus: 'held',
      submittedAt: expect.any(Date),
      decidedAt: null,
    });

    prisma.menuItem.update.mockClear();
    await service.update(vendorId, menuId, itemId, { isAvailable: false });
    expect(prisma.menuItem.update.mock.calls[0][0].data.moderationStatus).toBeUndefined();
  });

  it('submits a rejected item for review again when the vendor corrects it', async () => {
    const { service, prisma } = makeService({
      allergens: ['milk'],
      moderationStatus: 'rejected',
      decisionReason: 'Clarify the description',
    });
    await service.update(vendorId, menuId, itemId, { description: 'Clarified ingredients' });
    expect(prisma.menuItem.update.mock.calls[0][0].data).toMatchObject({
      moderationStatus: 'held',
      submittedAt: expect.any(Date),
      decidedAt: null,
      decisionReason: null,
    });
  });

  it('unpublishes and records an available item when its declaration is removed', async () => {
    const { service, prisma } = makeService({ allergens: ['milk'] });
    const updated = await service.update(vendorId, menuId, itemId, {
      allergens: [],
      allergensFreeFrom: false,
    });
    expect(updated).toMatchObject({ isAvailable: false });
    expect(prisma.menuItemAllergenRemediation.upsert).toHaveBeenCalled();
  });

  it('excludes a forced legacy row from public list queries', async () => {
    const { service, prisma } = makeService();
    await service.findByMenu(vendorId, menuId, {}, null);
    expect(prisma.menuItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isAvailable: true,
          AND: [expect.objectContaining({ OR: expect.any(Array) })],
        }),
      }),
    );
  });

  it('resolves remediation when a legacy item is declared and republished', async () => {
    const { service, prisma } = makeService({ isAvailable: false });
    const updated = await service.update(vendorId, menuId, itemId, {
      allergens: ['milk'],
      allergensFreeFrom: false,
      isAvailable: true,
    });
    expect(updated).toMatchObject({ isAvailable: true, allergens: ['milk'] });
    expect(prisma.menuItemAllergenRemediation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { resolvedAt: expect.any(Date) } }),
    );
  });
});

describe('MenuItemsService moderation decisions', () => {
  const vendorId = 'vendor-1';
  const item = {
    id: 'item-1',
    vendorId,
    menuId: 'menu-1',
    name: 'Stew',
    allergens: ['milk'],
    allergensFreeFrom: false,
    moderationStatus: 'held',
    submissionVersion: 1,
  };
  const admin = { id: 'admin-1', role: UserRole.admin } as AuthUser;

  function setup() {
    const prisma = {
      menuItem: {
        findUnique: jest.fn().mockResolvedValue(item),
        findMany: jest.fn().mockResolvedValue([item]),
        update: jest.fn().mockResolvedValue(item),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      vendor: { findUnique: jest.fn().mockResolvedValue({ userId: 'vendor-user-1' }) },
      inboxNotification: { create: jest.fn().mockResolvedValue({}) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    (prisma as any).$transaction = jest.fn().mockImplementation((callback) => callback(prisma));
    const inbox = {
      notify: jest.fn().mockResolvedValue(undefined),
      createTransactional: jest.fn().mockResolvedValue({}),
    };
    const notifications = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      createTransactionalOutbox: jest.fn().mockResolvedValue({ id: 'outbox-1' }),
      dispatchTransactionalOutbox: jest.fn().mockResolvedValue(undefined),
    };
    const service = new MenuItemsService(
      prisma as never,
      {} as never,
      { del: jest.fn(), delByPattern: jest.fn() } as never,
      {} as never,
      inbox as never,
      notifications as never,
    );
    return { service, prisma, inbox, notifications };
  }

  it('commits decision, vendor inbox and durable outbox before dispatching notification', async () => {
    const { service, prisma, inbox, notifications } = setup();
    await service.moderate(
      item.id,
      {
        status: ModerationStatus.rejected,
        expectedStatus: ModerationStatus.held,
        reason: 'Please clarify ingredients',
        expectedSubmissionVersion: 1,
      },
      admin,
    );
    expect(prisma.menuItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          moderationStatus: 'held',
          submissionVersion: 1,
        }),
        data: expect.objectContaining({
          moderationStatus: 'rejected',
          decisionReason: 'Please clarify ingredients',
          decidedAt: expect.any(Date),
          moderatedById: admin.id,
        }),
      }),
    );
    expect(inbox.createTransactional).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ userId: 'vendor-user-1', title: 'Menu item rejected' }),
    );
    expect(notifications.createTransactionalOutbox).toHaveBeenCalledWith(
      prisma,
      'menu_item_moderation_decision',
      expect.objectContaining({ userId: 'vendor-user-1', status: 'rejected' }),
      expect.any(String),
    );
    expect(notifications.dispatchTransactionalOutbox).toHaveBeenCalledWith(
      'outbox-1',
      'menu_item_moderation_decision',
      expect.any(Object),
      expect.any(String),
    );
  });

  it('rejects a stale single-item decision without writing notifications', async () => {
    const { service, prisma, inbox, notifications } = setup();
    prisma.menuItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.moderate(
        item.id,
        {
          status: ModerationStatus.approved,
          expectedStatus: ModerationStatus.held,
          expectedSubmissionVersion: 1,
        },
        admin,
      ),
    ).rejects.toMatchObject({ response: { code: 'MENU_ITEM_STALE_SUBMISSION' } });

    expect(inbox.createTransactional).not.toHaveBeenCalled();
    expect(notifications.createTransactionalOutbox).not.toHaveBeenCalled();
  });

  it.each([ModerationStatus.approved, ModerationStatus.auto_approved])(
    'allows staff to withdraw a %s item into held',
    async (sourceStatus) => {
      const { service, prisma } = setup();
      prisma.menuItem.findUnique.mockResolvedValue({
        ...item,
        moderationStatus: sourceStatus,
      });

      await service.moderate(
        item.id,
        {
          status: ModerationStatus.held,
          expectedStatus: sourceStatus,
          expectedSubmissionVersion: 1,
        },
        admin,
      );

      expect(prisma.menuItem.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            moderationStatus: sourceStatus,
            submissionVersion: 1,
          }),
          data: expect.objectContaining({ moderationStatus: ModerationStatus.held }),
        }),
      );
    },
  );

  it('rejects a stale approve-with-edit without changing content', async () => {
    const { service, prisma, inbox, notifications } = setup();
    prisma.menuItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.approveWithEdit(
        item.id,
        {
          expectedSubmissionVersion: 1,
          edit: { name: 'Corrected stew', description: 'Updated', basePricePence: 1500 },
        },
        admin,
      ),
    ).rejects.toMatchObject({ response: { code: 'MENU_ITEM_STALE_SUBMISSION' } });

    expect(prisma.menuItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ submissionVersion: 1 }) }),
    );
    expect(inbox.createTransactional).not.toHaveBeenCalled();
    expect(notifications.createTransactionalOutbox).not.toHaveBeenCalled();
  });

  it('rejects bulk approval when an ID is outside the specified vendor scope', async () => {
    const { service, prisma } = setup();
    prisma.menuItem.findMany.mockResolvedValue([]);
    await expect(
      service.bulkApprove(vendorId, [{ id: item.id, expectedSubmissionVersion: 1 }], admin),
    ).rejects.toMatchObject({
      response: { code: 'BULK_VENDOR_SCOPE_MISMATCH' },
    });
    expect(prisma.menuItem.updateMany).not.toHaveBeenCalled();
  });

  it('rolls back a bulk decision and creates no notifications when its conditional count mismatches', async () => {
    const { service, prisma, inbox, notifications } = setup();
    prisma.menuItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.bulkApprove(vendorId, [{ id: item.id, expectedSubmissionVersion: 1 }], admin),
    ).rejects.toMatchObject({
      response: { code: 'MENU_ITEM_STALE_SUBMISSION' },
    });

    expect(inbox.createTransactional).not.toHaveBeenCalled();
    expect(notifications.createTransactionalOutbox).not.toHaveBeenCalled();
    expect(notifications.dispatchTransactionalOutbox).not.toHaveBeenCalled();
  });

  it('writes every bulk outbox row in the transaction, then dispatches them in item order', async () => {
    const { service, prisma, notifications } = setup();
    const second = { ...item, id: 'item-2', name: 'Soup' };
    prisma.menuItem.findMany.mockResolvedValue([item, second]);
    prisma.menuItem.updateMany.mockResolvedValue({ count: 1 });
    notifications.createTransactionalOutbox
      .mockResolvedValueOnce({ id: 'outbox-1' })
      .mockResolvedValueOnce({ id: 'outbox-2' });

    await service.bulkApprove(
      vendorId,
      [
        { id: item.id, expectedSubmissionVersion: 1 },
        { id: second.id, expectedSubmissionVersion: 1 },
      ],
      admin,
    );

    expect(notifications.createTransactionalOutbox).toHaveBeenCalledTimes(2);
    expect(
      notifications.dispatchTransactionalOutbox.mock.calls.map((call: unknown[]) => call[0]),
    ).toEqual(['outbox-1', 'outbox-2']);
    expect(notifications.createTransactionalOutbox.mock.invocationCallOrder[1]).toBeLessThan(
      notifications.dispatchTransactionalOutbox.mock.invocationCallOrder[0],
    );
  });

  it('rejects manual approval when the allergen declaration is missing', async () => {
    const { service, prisma } = setup();
    prisma.menuItem.findUnique.mockResolvedValue({
      ...item,
      allergens: [],
      allergensFreeFrom: false,
    });

    await expect(
      service.moderate(
        item.id,
        {
          status: ModerationStatus.approved,
          expectedStatus: ModerationStatus.held,
          expectedSubmissionVersion: 1,
        },
        admin,
      ),
    ).rejects.toMatchObject({
      response: { code: 'ALLERGEN_DECLARATION_REQUIRED' },
    });
    expect(prisma.menuItem.updateMany).not.toHaveBeenCalled();
  });
});
