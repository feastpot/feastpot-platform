import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { TermsModule } from '../terms/terms.module';
import { VendorMembersModule } from '../vendor-members/vendor-members.module';

import { CatalogueController } from './catalogue.controller';
import { TermsAcceptanceGuard } from './guards/terms-acceptance.guard';
import { VendorOwnershipGuard } from './guards/vendor-ownership.guard';
import { MenuImportOcrService } from './menu-import.ocr.service';
import { MenuImportService } from './menu-import.service';
import { MenuItemsService } from './menu-items.service';
import { MenuModerationController } from './menu-moderation.controller';
import { MenusService } from './menus.service';
import { SupabaseStorageService } from './supabase-storage.service';

@Module({
  imports: [PrismaModule, AuthModule, VendorMembersModule, TermsModule],
  controllers: [CatalogueController, MenuModerationController],
  providers: [
    MenusService,
    MenuItemsService,
    SupabaseStorageService,
    VendorOwnershipGuard,
    TermsAcceptanceGuard,
    MenuImportService,
    MenuImportOcrService,
  ],
  exports: [
    MenusService,
    MenuItemsService,
    SupabaseStorageService,
    VendorOwnershipGuard,
    MenuImportService,
  ],
})
export class CatalogueModule {}
