import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';

import { AccountDeletionAdminController } from './account-deletion-admin.controller';
import { AccountDeletionService } from './account-deletion.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // AuthModule re-exports SupabaseService - we need the service-role client
  // to mirror profile changes (phone updates, account deletes) into Supabase
  // Auth on top of the public.users row.
  imports: [PrismaModule, AuthModule],
  controllers: [UsersController, AccountDeletionAdminController],
  providers: [UsersService, AccountDeletionService],
  exports: [UsersService],
})
export class UsersModule {}
