import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';

import { CatalogueController } from './catalogue.controller';
import { VendorOwnershipGuard } from './guards/vendor-ownership.guard';
import { MenuItemsService } from './menu-items.service';
import { MenusService } from './menus.service';
import { SupabaseStorageService } from './supabase-storage.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CatalogueController],
  providers: [MenusService, MenuItemsService, SupabaseStorageService, VendorOwnershipGuard],
  exports: [MenusService, MenuItemsService, SupabaseStorageService, VendorOwnershipGuard],
})
export class CatalogueModule {}
