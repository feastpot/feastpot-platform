import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';

import { VendorMembersController } from './vendor-members.controller';
import { VendorMembersService } from './vendor-members.service';

@Module({
  // AuthModule re-exports SupabaseService so the invite flow can mint a
  // magic-link via supabase.auth.admin.generateLink without depending on
  // AdminModule. NotificationsModule is @Global() so EmailProvider needs
  // no module import here.
  imports: [PrismaModule, AuthModule],
  controllers: [VendorMembersController],
  providers: [VendorMembersService],
  exports: [VendorMembersService],
})
export class VendorMembersModule {}
