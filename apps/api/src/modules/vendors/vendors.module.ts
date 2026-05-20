import { Module } from '@nestjs/common';

import { PrismaModule } from '../../prisma/prisma.module';
import { CatalogueModule } from '../catalogue/catalogue.module';
import { VendorMembersModule } from '../vendor-members/vendor-members.module';

import { VendorsController } from './vendors.controller';
import { VendorRepository } from './vendors.repository';
import { VendorsService } from './vendors.service';

@Module({
  // CatalogueModule is re-imported here purely to reuse SupabaseStorageService
  // for vendor logo/cover uploads (T005). CatalogueModule does not depend on
  // VendorsModule, so this introduces no circular import.
  imports: [PrismaModule, CatalogueModule, VendorMembersModule],
  controllers: [VendorsController],
  providers: [VendorsService, VendorRepository],
  // PrismaModule is @Global, so VendorsService can inject PrismaService for stats
  // without re-importing it here.
  exports: [VendorsService],
})
export class VendorsModule {}
