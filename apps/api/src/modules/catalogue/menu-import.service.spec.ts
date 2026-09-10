import { MenuImportItemStatus, MenuImportStatus, ModerationStatus } from '@prisma/client';

import type { PrismaService } from '../../prisma/prisma.service';

import type { MenuImportOcrService } from './menu-import.ocr.service';
import { MenuImportService } from './menu-import.service';
import type { SupabaseStorageService } from './supabase-storage.service';

const candidate = (overrides: Record<string, unknown> = {}) => ({
  id: 'candidate-1',
  importId: 'import-1',
  name: 'Jollof',
  description: null,
  pricePence: 1200,
  portionLabel: null,
  reviewFlags: [],
  allergens: [],
  allergensFreeFrom: false,
  allergenConfirmedAt: null,
  status: MenuImportItemStatus.candidate,
  ...overrides,
});

describe('MenuImportService', () => {
  const prisma = {
    menuImport: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    menuImportItem: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    menu: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const storage = { uploadMenuImportSource: jest.fn() } as unknown as SupabaseStorageService;
  const ocr = { extract: jest.fn() } as unknown as MenuImportOcrService;
  let service: MenuImportService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MenuImportService(prisma, storage, ocr);
  });

  it('scopes reads and candidate edits to the owning vendor', async () => {
    prisma.menuImport.findFirst = jest.fn().mockResolvedValue(null);
    await expect(service.get('other-vendor', 'import-1')).rejects.toThrow('Menu import not found');
    expect(prisma.menuImport.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'import-1', vendorId: 'other-vendor' } }),
    );
  });

  it('retains uploaded source metadata and returns a safe failure', async () => {
    prisma.menuImport.create = jest.fn().mockResolvedValue({ id: 'import-1' });
    storage.uploadMenuImportSource = jest
      .fn()
      .mockResolvedValue({ path: 'vendors/v/menu-imports/i/menu.png' });
    ocr.extract = jest.fn().mockRejectedValue(new Error('command /secret/path leaked'));
    prisma.menuImport.update = jest.fn().mockResolvedValue({});
    prisma.menuImport.findFirst = jest.fn().mockResolvedValue({ id: 'import-1', items: [] });

    await service.create('vendor-1', [
      { originalname: 'menu.png', mimetype: 'image/png', size: 10, buffer: Buffer.from('image') },
    ]);
    expect(prisma.menuImport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: MenuImportStatus.failed,
          sourceFiles: [
            {
              path: 'vendors/v/menu-imports/i/menu.png',
              name: 'menu.png',
              mime: 'image/png',
              errorCode: 'OCR_FAILED',
              errorMessage: 'Local OCR failed',
            },
          ],
          errorMessage: expect.not.stringContaining('secret/path'),
        }),
      }),
    );
  });

  it('never infers allergens from OCR text, including an allergen in the dish name', async () => {
    prisma.menuImport.create = jest.fn().mockResolvedValue({ id: 'import-1' });
    storage.uploadMenuImportSource = jest
      .fn()
      .mockResolvedValue({ path: 'vendors/v/menu-imports/i/menu.png' });
    ocr.extract = jest.fn().mockResolvedValue([
      {
        name: 'Peanut soup',
        description: 'A soup made with peanuts',
        pricePence: 1500,
      },
    ]);
    prisma.menuImport.update = jest.fn().mockResolvedValue({});
    prisma.menuImport.findFirst = jest.fn().mockResolvedValue({ id: 'import-1', items: [] });

    await service.create('vendor-1', [
      {
        originalname: 'peanut-soup.png',
        mimetype: 'image/png',
        size: 10,
        buffer: Buffer.from('image'),
      },
    ]);

    expect(prisma.menuImport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            create: [
              expect.objectContaining({
                name: 'Peanut soup',
                allergens: [],
                allergensFreeFrom: false,
              }),
            ],
          },
        }),
      }),
    );
  });

  it('bulk confirms only selected candidates owned by the import', async () => {
    prisma.menuImport.findFirst = jest.fn().mockResolvedValue({ id: 'import-1', items: [] });
    prisma.menuImportItem.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const result = await service.bulkConfirm('vendor-1', 'import-1', {
      itemIds: ['candidate-1'],
      allergens: ['milk'],
      allergensFreeFrom: false,
    });
    expect(result).toEqual({ confirmedCount: 1 });
    expect(prisma.menuImportItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['candidate-1'] },
          importId: 'import-1',
          import: { vendorId: 'vendor-1' },
        }),
      }),
    );
  });

  it('requires a confirmed source before copying allergens', async () => {
    prisma.menuImportItem.findFirst = jest
      .fn()
      .mockResolvedValueOnce(candidate())
      .mockResolvedValueOnce(candidate({ id: 'source-1' }));
    await expect(
      service.copyConfirm('vendor-1', 'import-1', 'candidate-1', { sourceItemId: 'source-1' }),
    ).rejects.toThrow('Confirm the source candidate allergens first');
  });

  it('rejects apply when price or explicit allergen confirmation is missing', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      menuImport: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'import-1',
          items: [candidate({ pricePence: null, allergens: ['milk'] })],
        }),
      },
    };
    prisma.$transaction = jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx));
    await expect(service.apply('vendor-1', 'import-1', 'menu-1')).rejects.toThrow(
      'Every applied candidate',
    );
  });

  it('applies held, unavailable items and retry does not duplicate them', async () => {
    const row = candidate({
      status: MenuImportItemStatus.accepted,
      allergens: ['milk'],
      allergenConfirmedAt: new Date(),
    });
    prisma.menuImport.findFirst = jest.fn().mockResolvedValue({ id: 'import-1', items: [row] });
    prisma.menu.findFirst = jest.fn().mockResolvedValue({ id: 'menu-1', vendorId: 'vendor-1' });
    let applied = false;
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      menuImportItem: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ menuItemId: null })
          .mockResolvedValueOnce({ menuItemId: 'item-1' }),
        update: jest.fn(),
      },
      menuItem: { create: jest.fn().mockResolvedValue({ id: 'item-1' }) },
      menuImport: {
        findFirst: jest.fn().mockImplementation(() => ({
          id: 'import-1',
          status: applied ? MenuImportStatus.applied : MenuImportStatus.extracted,
          items: [
            {
              ...row,
              status: applied ? MenuImportItemStatus.applied : MenuImportItemStatus.accepted,
              menuItem: applied ? { id: 'item-1', menuId: 'menu-1' } : null,
            },
          ],
        })),
        update: jest.fn().mockImplementation(() => {
          applied = true;
          return {};
        }),
      },
      menu: { findFirst: jest.fn().mockResolvedValue({ id: 'menu-1', vendorId: 'vendor-1' }) },
    };
    prisma.$transaction = jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx));

    await service.apply('vendor-1', 'import-1', 'menu-1');
    expect(tx.menuItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isAvailable: false,
          moderationStatus: ModerationStatus.held,
          allergens: ['milk'],
          allergensFreeFrom: false,
        }),
      }),
    );
    const retry = await service.apply('vendor-1', 'import-1', 'menu-1');
    expect(retry).toEqual({ createdItemIds: ['item-1'] });
    expect(tx.menuItem.create).toHaveBeenCalledTimes(1);
  });

  it('rejects inconsistent allergen declarations', async () => {
    prisma.menuImportItem.findFirst = jest.fn().mockResolvedValue(candidate());
    await expect(
      service.confirm('vendor-1', 'import-1', 'candidate-1', {
        allergens: ['milk'],
        allergensFreeFrom: true,
      }),
    ).rejects.toThrow('not both');
  });

  it('rejects an applied import when retried for another menu', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      menuImport: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'import-1',
          status: MenuImportStatus.applied,
          items: [
            {
              ...candidate({ status: MenuImportItemStatus.applied, menuItemId: 'item-1' }),
              menuItem: { id: 'item-1', menuId: 'menu-1' },
            },
          ],
        }),
      },
    };
    prisma.$transaction = jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx));
    await expect(service.apply('vendor-1', 'import-1', 'menu-2')).rejects.toThrow(
      'already applied to a different menu',
    );
  });
});
