import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';

@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}

  findByVendor(vendorId: string, includeInactive = false) {
    return this.prisma.menu.findMany({
      where: { vendorId, ...(includeInactive ? {} : { isActive: true }) },
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

  create(vendorId: string, dto: CreateMenuDto) {
    return this.prisma.menu.create({
      data: {
        vendorId,
        name: dto.name,
        // Defaults applied here (not on the DTO) so that PartialType-derived
        // UpdateMenuDto does not silently re-impose them on PATCH.
        isActive: dto.isActive ?? true,
        sortOrder: dto.displayOrder ?? 0,
      },
    });
  }

  async update(vendorId: string, menuId: string, dto: UpdateMenuDto) {
    await this.assertBelongs(vendorId, menuId);
    return this.prisma.menu.update({
      where: { id: menuId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.displayOrder !== undefined ? { sortOrder: dto.displayOrder } : {}),
      },
    });
  }

  async delete(vendorId: string, menuId: string) {
    await this.assertBelongs(vendorId, menuId);
    const itemCount = await this.prisma.menuItem.count({ where: { menuId } });
    if (itemCount > 0) {
      throw new ConflictException({
        code: 'MENU_NOT_EMPTY',
        message: `Cannot delete menu — it still contains ${itemCount} item(s). Remove or move them first.`,
      });
    }
    await this.prisma.menu.delete({ where: { id: menuId } });
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
