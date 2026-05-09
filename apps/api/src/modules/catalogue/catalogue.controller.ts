import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';

import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { CreateMenuDto } from './dto/create-menu.dto';
import { ListMenuItemsDto } from './dto/list-menu-items.dto';
import { ToggleAvailabilityDto } from './dto/toggle-availability.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { VendorOwnershipGuard } from './guards/vendor-ownership.guard';
import { MenuItemsService } from './menu-items.service';
import { MenusService } from './menus.service';

@ApiTags('Catalogue')
@Controller({ path: 'vendors/:vendorId', version: '1' })
export class CatalogueController {
  constructor(
    private readonly menus: MenusService,
    private readonly items: MenuItemsService,
  ) {}

  // ---------- Menus ----------

  @Public()
  @Get('menus')
  @ApiOperation({ summary: 'List active menus for a vendor (public)' })
  listMenus(@Param('vendorId', new ParseUUIDPipe()) vendorId: string) {
    return this.menus.findByVendor(vendorId, false);
  }

  @Post('menus')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  @ApiOperation({ summary: 'Create a menu (vendor owner / admin)' })
  createMenu(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Body() dto: CreateMenuDto,
  ) {
    return this.menus.create(vendorId, dto);
  }

  @Patch('menus/:menuId')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  @ApiOperation({ summary: 'Update a menu (vendor owner / admin)' })
  updateMenu(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('menuId', new ParseUUIDPipe()) menuId: string,
    @Body() dto: UpdateMenuDto,
  ) {
    return this.menus.update(vendorId, menuId, dto);
  }

  @Delete('menus/:menuId')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  @ApiOperation({ summary: 'Delete an empty menu (vendor owner / admin)' })
  deleteMenu(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('menuId', new ParseUUIDPipe()) menuId: string,
  ) {
    return this.menus.delete(vendorId, menuId);
  }

  // ---------- Menu items ----------

  @Public()
  @Get('menus/:menuId/items')
  @ApiOperation({ summary: 'List menu items (public, with filters)' })
  listItems(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('menuId', new ParseUUIDPipe()) menuId: string,
    @Query() filters: ListMenuItemsDto,
  ) {
    return this.items.findByMenu(vendorId, menuId, filters);
  }

  @Post('menus/:menuId/items')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  @ApiOperation({ summary: 'Create a menu item (vendor owner / admin)' })
  createItem(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('menuId', new ParseUUIDPipe()) menuId: string,
    @Body() dto: CreateMenuItemDto,
  ) {
    return this.items.create(vendorId, menuId, dto);
  }

  @Public()
  @Get('menus/:menuId/items/:itemId')
  @ApiOperation({ summary: 'Get a menu item (public)' })
  getItem(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('menuId', new ParseUUIDPipe()) menuId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ) {
    return this.items.findOne(vendorId, menuId, itemId);
  }

  @Patch('menus/:menuId/items/:itemId')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  @ApiOperation({ summary: 'Update a menu item (vendor owner / admin)' })
  updateItem(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('menuId', new ParseUUIDPipe()) menuId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: UpdateMenuItemDto,
  ) {
    return this.items.update(vendorId, menuId, itemId, dto);
  }

  @Delete('menus/:menuId/items/:itemId')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  @ApiOperation({ summary: 'Delete a menu item (vendor owner / admin)' })
  deleteItem(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('menuId', new ParseUUIDPipe()) menuId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
  ) {
    return this.items.delete(vendorId, menuId, itemId);
  }

  @Patch('menus/:menuId/items/:itemId/availability')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  @ApiOperation({ summary: 'Toggle item availability (vendor owner / admin)' })
  toggleItem(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('menuId', new ParseUUIDPipe()) menuId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Body() dto: ToggleAvailabilityDto,
  ) {
    return this.items.toggleAvailability(vendorId, menuId, itemId, dto.isAvailable);
  }

  @Post('menus/:menuId/items/:itemId/images')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  @ApiOperation({ summary: 'Upload a menu item image to Supabase Storage (max 5MB, jpeg/png/webp)' })
  uploadItemImage(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('menuId', new ParseUUIDPipe()) menuId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'multipart field "file" is required' });
    }
    return this.items.uploadImage({ vendorId, menuId, itemId, file });
  }
}
