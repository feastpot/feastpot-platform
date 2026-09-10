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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { OptionalAuthGuard } from '../../auth/guards/optional-auth.guard';
import type { AuthedRequest } from '../../auth/types';

import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { CreateMenuDto } from './dto/create-menu.dto';
import { ListMenuItemsDto } from './dto/list-menu-items.dto';
import {
  AddMenuImportItemDto,
  AllergenConfirmationDto,
  BulkAllergenConfirmationDto,
  CopyAllergenConfirmationDto,
  EditMenuImportItemDto,
  ApplyMenuImportDto,
} from './dto/menu-import.dto';
import { ReorderMenuItemsDto } from './dto/reorder-menu-items.dto';
import { ReorderMenusDto } from './dto/reorder-menus.dto';
import { ToggleAvailabilityDto } from './dto/toggle-availability.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { TermsAcceptanceGuard } from './guards/terms-acceptance.guard';
import { VendorOwnershipGuard } from './guards/vendor-ownership.guard';
import { MenuImportService } from './menu-import.service';
import { MenuItemsService } from './menu-items.service';
import { MenusService } from './menus.service';

@ApiTags('Catalogue')
@UseGuards(TermsAcceptanceGuard)
@Controller({ path: 'vendors/:vendorId', version: '1' })
export class CatalogueController {
  constructor(
    private readonly menus: MenusService,
    private readonly items: MenuItemsService,
    private readonly imports: MenuImportService,
  ) {}

  @Post('menu-imports')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 4, { limits: { fileSize: 10 * 1024 * 1024, files: 4 } }),
  )
  uploadMenuImport(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.imports.create(vendorId, files ?? []);
  }

  @Get('menu-imports')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  listMenuImports(@Param('vendorId', new ParseUUIDPipe()) vendorId: string) {
    return this.imports.list(vendorId);
  }

  @Get('menu-imports/:importId')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  getMenuImport(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('importId', new ParseUUIDPipe()) id: string,
  ) {
    return this.imports.get(vendorId, id);
  }

  @Patch('menu-imports/:importId/items/:itemId')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  editMenuImportItem(
    @Param('vendorId', new ParseUUIDPipe()) v: string,
    @Param('importId', new ParseUUIDPipe()) i: string,
    @Param('itemId', new ParseUUIDPipe()) c: string,
    @Body() dto: EditMenuImportItemDto,
  ) {
    return this.imports.edit(v, i, c, dto);
  }

  @Post('menu-imports/:importId/items')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  addMenuImportItem(
    @Param('vendorId', new ParseUUIDPipe()) v: string,
    @Param('importId', new ParseUUIDPipe()) i: string,
    @Body() dto: AddMenuImportItemDto,
  ) {
    return this.imports.add(v, i, dto);
  }

  @Post('menu-imports/:importId/items/:itemId/reject')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  rejectMenuImportItem(
    @Param('vendorId', new ParseUUIDPipe()) v: string,
    @Param('importId', new ParseUUIDPipe()) i: string,
    @Param('itemId', new ParseUUIDPipe()) c: string,
  ) {
    return this.imports.reject(v, i, c);
  }

  @Post('menu-imports/:importId/items/:itemId/allergens')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  confirmMenuImportItemAllergens(
    @Param('vendorId', new ParseUUIDPipe()) v: string,
    @Param('importId', new ParseUUIDPipe()) i: string,
    @Param('itemId', new ParseUUIDPipe()) c: string,
    @Body() dto: AllergenConfirmationDto,
  ) {
    return this.imports.confirm(v, i, c, dto);
  }

  @Post('menu-imports/:importId/allergens/bulk')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  bulkConfirmMenuImportAllergens(
    @Param('vendorId', new ParseUUIDPipe()) v: string,
    @Param('importId', new ParseUUIDPipe()) i: string,
    @Body() dto: BulkAllergenConfirmationDto,
  ) {
    return this.imports.bulkConfirm(v, i, dto);
  }

  @Post('menu-imports/:importId/items/:itemId/allergens/copy')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  copyMenuImportAllergens(
    @Param('vendorId', new ParseUUIDPipe()) v: string,
    @Param('importId', new ParseUUIDPipe()) i: string,
    @Param('itemId', new ParseUUIDPipe()) c: string,
    @Body() dto: CopyAllergenConfirmationDto,
  ) {
    return this.imports.copyConfirm(v, i, c, dto);
  }

  @Post('menu-imports/:importId/apply')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  applyMenuImport(
    @Param('vendorId', new ParseUUIDPipe()) v: string,
    @Param('importId', new ParseUUIDPipe()) i: string,
    @Body() dto: ApplyMenuImportDto,
  ) {
    return this.imports.apply(v, i, dto.menuId);
  }

  // ---------- Menus ----------

  @Public()
  @UseGuards(OptionalAuthGuard)
  @Get('menus')
  @ApiOperation({
    summary:
      'List menus for a vendor. Public callers always receive only active menus; passing ?includeInactive=true is honoured only for the vendor owner / admin. The OptionalAuthGuard populates `req.user` when a valid bearer token is present (Public marks the route exempt from the global SupabaseAuthGuard, so without OptionalAuthGuard there would be no user to gate on).',
  })
  listMenus(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Query('includeInactive') includeInactive?: string,
    @Req() req?: AuthedRequest,
  ) {
    // Treat `?includeInactive=1|true` as truthy, anything else as false. We do
    // NOT trust this flag from anonymous callers - only an authed vendor-owner
    // or admin/compliance role may see inactive menus. That gate lives in the
    // service so this controller stays declarative.
    const wants = includeInactive === 'true' || includeInactive === '1';
    return this.menus.findByVendor(vendorId, wants, req?.user ?? null);
  }

  @Post('menus')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  @ApiOperation({ summary: 'Create a menu (vendor owner / admin)' })
  createMenu(@Param('vendorId', new ParseUUIDPipe()) vendorId: string, @Body() dto: CreateMenuDto) {
    return this.menus.create(vendorId, dto);
  }

  // Declared BEFORE `menus/:menuId` so the literal `reorder` segment is matched
  // by this route and never captured as a `:menuId` UUID param.
  @Patch('menus/reorder')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  @ApiOperation({ summary: "Reorder a vendor's menus (vendor owner / admin)" })
  reorderMenus(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Body() dto: ReorderMenusDto,
  ) {
    return this.menus.reorder(vendorId, dto.menuIds);
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

  @Get('menu-moderation-policy')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  @ApiOperation({ summary: 'Get the menu moderation mode and pilot review SLA' })
  menuModerationPolicy() {
    return this.items.moderationPolicy();
  }

  @Get('allergen-remediation')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  @ApiOperation({ summary: 'List dishes hidden for missing allergen declarations' })
  listAllergenRemediation(@Param('vendorId', new ParseUUIDPipe()) vendorId: string) {
    return this.items.listAllergenRemediation(vendorId);
  }

  @Public()
  @UseGuards(OptionalAuthGuard)
  @Get('menus/:menuId/items')
  @ApiOperation({
    summary:
      'List menu items. Public callers always receive only published items (isAvailable=true); the vendor owner / admin / compliance see drafts too. OptionalAuthGuard populates req.user when a bearer token is present so the service can apply the gate.',
  })
  listItems(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('menuId', new ParseUUIDPipe()) menuId: string,
    @Query() filters: ListMenuItemsDto,
    @Req() req?: AuthedRequest,
  ) {
    return this.items.findByMenu(vendorId, menuId, filters, req?.user ?? null);
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
  @UseGuards(OptionalAuthGuard)
  @Get('menus/:menuId/items/:itemId')
  @ApiOperation({
    summary:
      'Get a menu item. Public callers receive a 404 for unpublished drafts; the vendor owner / admin / compliance can read drafts.',
  })
  getItem(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('menuId', new ParseUUIDPipe()) menuId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() req?: AuthedRequest,
  ) {
    return this.items.findOne(vendorId, menuId, itemId, req?.user ?? null);
  }

  // Declared BEFORE `items/:itemId` so the literal `reorder` segment is matched
  // by this route and never captured as an `:itemId` UUID param.
  @Patch('menus/:menuId/items/reorder')
  @ApiBearerAuth()
  @Roles(UserRole.vendor, UserRole.admin)
  @UseGuards(VendorOwnershipGuard)
  @ApiOperation({ summary: "Reorder a menu's items (vendor owner / admin)" })
  reorderItems(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('menuId', new ParseUUIDPipe()) menuId: string,
    @Body() dto: ReorderMenuItemsDto,
  ) {
    return this.items.reorder(vendorId, menuId, dto.itemIds);
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
  @ApiOperation({
    summary: 'Upload a menu item image to Supabase Storage (max 5MB, jpeg/png/webp)',
  })
  uploadItemImage(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('menuId', new ParseUUIDPipe()) menuId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() req: AuthedRequest,
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
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'multipart field "file" is required',
      });
    }
    // Pass the authenticated caller so findOne can serve draft items to their
    // owner.  Without this, uploads to unpublished (draft) items return 404
    // because findOne treats a null caller as anonymous.
    return this.items.uploadImage({ vendorId, menuId, itemId, caller: req.user!, file });
  }
}
