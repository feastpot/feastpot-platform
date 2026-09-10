import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MenuImportItemStatus, MenuImportStatus, ModerationStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

import { FSA_14_ALLERGEN_SET } from './catalogue.constants';
import {
  AddMenuImportItemDto,
  AllergenConfirmationDto,
  BulkAllergenConfirmationDto,
  CopyAllergenConfirmationDto,
  EditMenuImportItemDto,
} from './dto/menu-import.dto';
import { MenuImportOcrService } from './menu-import.ocr.service';
import { SupabaseStorageService } from './supabase-storage.service';

@Injectable()
export class MenuImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: SupabaseStorageService,
    private readonly ocr: MenuImportOcrService,
  ) {}

  async create(
    vendorId: string,
    files: Array<{ originalname: string; mimetype: string; size: number; buffer: Buffer }>,
  ) {
    if (!files.length || files.length > 4)
      throw new BadRequestException({
        code: 'INVALID_FILE_COUNT',
        message: 'Upload 1 to 4 files.',
      });
    const imp = await this.prisma.menuImport.create({ data: { vendorId, sourceFiles: [] } });
    const sources: Array<Record<string, string>> = [];
    const all: Array<{
      name: string;
      description?: string;
      pricePence?: number;
      portionLabel?: string;
      reviewFlags: string[];
    }> = [];
    // Store every original before invoking any native OCR process.
    for (const file of files) {
      try {
        const uploaded = await this.storage.uploadMenuImportSource({
          vendorId,
          importId: imp.id,
          file,
        });
        sources.push({ path: uploaded.path, name: file.originalname, mime: file.mimetype });
      } catch (error) {
        sources.push({
          name: file.originalname.slice(0, 255),
          mime: file.mimetype,
          errorCode: error instanceof BadRequestException ? 'INVALID_SOURCE' : 'UPLOAD_FAILED',
          errorMessage:
            error instanceof BadRequestException
              ? 'Source file was rejected'
              : 'Source file could not be stored',
        });
      }
      await this.prisma.menuImport.update({
        where: { id: imp.id },
        data: { sourceFiles: sources },
      });
    }
    // A bad page must not discard candidates extracted from other files.
    for (let index = 0; index < files.length; index += 1) {
      if (!sources[index]?.path) continue;
      try {
        all.push(...(await this.ocr.extract(files[index])).slice(0, Math.max(0, 30 - all.length)));
      } catch (error) {
        sources[index] = {
          ...sources[index],
          errorCode: error instanceof BadRequestException ? 'EXTRACTION_FAILED' : 'OCR_FAILED',
          errorMessage:
            error instanceof BadRequestException
              ? 'Source could not be extracted'
              : 'Local OCR failed',
        };
        await this.prisma.menuImport.update({
          where: { id: imp.id },
          data: { sourceFiles: sources },
        });
      }
    }
    await this.prisma.menuImport.update({
      where: { id: imp.id },
      data: {
        sourceFiles: sources,
        status: all.length ? MenuImportStatus.extracted : MenuImportStatus.failed,
        ...(all.length
          ? {
              items: {
                create: all.map((x) => ({
                  name: x.name,
                  description: x.description,
                  pricePence: x.pricePence,
                  portionLabel: x.portionLabel,
                  reviewFlags: x.reviewFlags,
                  allergens: [],
                  allergensFreeFrom: false,
                })),
              },
            }
          : { errorCode: 'EXTRACTION_FAILED', errorMessage: 'No source produced menu candidates' }),
      },
    });
    return this.get(vendorId, imp.id);
  }
  async list(vendorId: string) {
    return this.prisma.menuImport.findMany({
      where: { vendorId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  async get(vendorId: string, id: string) {
    const row = await this.prisma.menuImport.findFirst({
      where: { id, vendorId },
      include: { items: true },
    });
    if (!row)
      throw new NotFoundException({
        code: 'MENU_IMPORT_NOT_FOUND',
        message: 'Menu import not found',
      });
    return row;
  }
  private async item(vendorId: string, importId: string, itemId: string) {
    const row = await this.prisma.menuImportItem.findFirst({
      where: { id: itemId, importId, import: { vendorId } },
    });
    if (!row)
      throw new NotFoundException({
        code: 'MENU_IMPORT_ITEM_NOT_FOUND',
        message: 'Import candidate not found',
      });
    return row;
  }
  async edit(vendorId: string, importId: string, itemId: string, dto: EditMenuImportItemDto) {
    await this.item(vendorId, importId, itemId);
    return this.prisma.menuImportItem.update({
      where: { id: itemId },
      data: dto as Prisma.MenuImportItemUncheckedUpdateInput,
    });
  }
  async add(vendorId: string, importId: string, dto: AddMenuImportItemDto) {
    await this.get(vendorId, importId);
    return this.prisma.menuImportItem.create({
      data: {
        importId,
        name: dto.name,
        description: dto.description,
        pricePence: dto.pricePence,
        portionLabel: dto.portionLabel,
        reviewFlags: dto.pricePence ? [] : ['missing_price'],
        allergens: [],
        allergensFreeFrom: false,
      },
    });
  }
  async reject(vendorId: string, importId: string, itemId: string) {
    await this.item(vendorId, importId, itemId);
    return this.prisma.menuImportItem.update({
      where: { id: itemId },
      data: { status: MenuImportItemStatus.rejected },
    });
  }
  private confirmation(dto: AllergenConfirmationDto | BulkAllergenConfirmationDto) {
    const unknown = dto.allergens.filter((a) => !FSA_14_ALLERGEN_SET.has(a));
    if (unknown.length)
      throw new BadRequestException({ code: 'INVALID_ALLERGEN', message: unknown.join(', ') });
    if (dto.allergens.length > 0 && dto.allergensFreeFrom)
      throw new BadRequestException({
        code: 'INCONSISTENT_ALLERGEN_CONFIRMATION',
        message: 'Choose declared allergens or free-from-all-14, not both.',
      });
    if (dto.allergens.length === 0 && !dto.allergensFreeFrom)
      throw new BadRequestException({
        code: 'ALLERGEN_CONFIRMATION_REQUIRED',
        message: 'Confirm allergens or all-free-from.',
      });
  }
  async confirm(vendorId: string, importId: string, itemId: string, dto: AllergenConfirmationDto) {
    await this.item(vendorId, importId, itemId);
    this.confirmation(dto);
    return this.prisma.menuImportItem.update({
      where: { id: itemId },
      data: {
        allergens: dto.allergens,
        allergensFreeFrom: dto.allergensFreeFrom,
        allergenConfirmedAt: new Date(),
        status: MenuImportItemStatus.accepted,
      },
    });
  }
  async bulkConfirm(vendorId: string, importId: string, dto: BulkAllergenConfirmationDto) {
    await this.get(vendorId, importId);
    this.confirmation(dto);
    const result = await this.prisma.menuImportItem.updateMany({
      where: {
        id: { in: dto.itemIds },
        importId,
        import: { vendorId },
        status: { not: MenuImportItemStatus.rejected },
      },
      data: {
        allergens: dto.allergens,
        allergensFreeFrom: dto.allergensFreeFrom,
        allergenConfirmedAt: new Date(),
        status: MenuImportItemStatus.accepted,
      },
    });
    if (result.count !== dto.itemIds.length)
      throw new BadRequestException({
        code: 'INVALID_BULK_ITEMS',
        message: 'Candidates must belong to this import.',
      });
    return { confirmedCount: result.count };
  }
  async copyConfirm(
    vendorId: string,
    importId: string,
    itemId: string,
    dto: CopyAllergenConfirmationDto,
  ) {
    const target = await this.item(vendorId, importId, itemId);
    const source = await this.item(vendorId, importId, dto.sourceItemId);
    if (source.id === target.id || !source.allergenConfirmedAt)
      throw new BadRequestException({
        code: 'SOURCE_ALLERGEN_UNCONFIRMED',
        message: 'Confirm the source candidate allergens first.',
      });
    return this.prisma.menuImportItem.update({
      where: { id: target.id },
      data: {
        allergens: source.allergens,
        allergensFreeFrom: source.allergensFreeFrom,
        allergenConfirmedAt: new Date(),
        status: MenuImportItemStatus.accepted,
      },
    });
  }
  async apply(vendorId: string, importId: string, menuId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize concurrent/retried applies on the import itself. The unique
      // menuItemId constraint is a second line of defence against duplicates.
      await tx.$queryRaw`SELECT id FROM menu_imports WHERE id = ${importId} AND vendor_id = ${vendorId} FOR UPDATE`;
      const row = await tx.menuImport.findFirst({
        where: { id: importId, vendorId },
        include: { items: { include: { menuItem: { select: { id: true, menuId: true } } } } },
      });
      if (!row)
        throw new NotFoundException({
          code: 'MENU_IMPORT_NOT_FOUND',
          message: 'Menu import not found',
        });
      if (row.status === MenuImportStatus.applied) {
        const linked = row.items.filter((item) => item.menuItem);
        const linkedMenuIds = new Set(linked.map((item) => item.menuItem!.menuId));
        if (linkedMenuIds.size && (linkedMenuIds.size !== 1 || !linkedMenuIds.has(menuId))) {
          throw new BadRequestException({
            code: 'IMPORT_ALREADY_APPLIED_TO_DIFFERENT_MENU',
            message: 'This import was already applied to a different menu.',
          });
        }
        return { createdItemIds: linked.map((item) => item.menuItem!.id) };
      }
      const active = row.items.filter(
        (x) =>
          x.status === MenuImportItemStatus.accepted &&
          (x.allergens.length > 0 || x.allergensFreeFrom),
      );
      if (!active.length || active.some((x) => !x.pricePence || !x.allergenConfirmedAt))
        throw new BadRequestException({
          code: 'IMPORT_REVIEW_REQUIRED',
          message: 'Every applied candidate needs a price and explicit allergen confirmation.',
        });
      const menu = await tx.menu.findFirst({ where: { id: menuId, vendorId } });
      if (!menu) throw new NotFoundException({ code: 'MENU_NOT_FOUND', message: 'Menu not found' });
      const created = [];
      for (const c of active) {
        const existing = await tx.menuImportItem.findUnique({
          where: { id: c.id },
          select: { menuItemId: true },
        });
        if (existing?.menuItemId) {
          created.push(existing.menuItemId);
          continue;
        }
        const item = await tx.menuItem.create({
          data: {
            vendorId,
            menuId,
            name: c.name,
            description: c.description,
            category: 'Imported',
            pricePence: c.pricePence!,
            servingsCount: null,
            preparationHours: 24,
            imageUrls: [],
            allergens: c.allergens,
            allergensFreeFrom: c.allergensFreeFrom,
            tags: c.portionLabel ? [`portion:${c.portionLabel}`] : [],
            isAvailable: false,
            moderationStatus: ModerationStatus.held,
            submittedAt: new Date(),
            menuImportItems: { connect: { id: c.id } },
          },
        });
        await tx.menuImportItem.update({
          where: { id: c.id },
          data: { status: MenuImportItemStatus.applied, menuItemId: item.id },
        });
        created.push(item.id);
      }
      await tx.menuImport.update({
        where: { id: importId },
        data: { status: MenuImportStatus.applied },
      });
      return { createdItemIds: created };
    });
  }
}
