import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from '../prisma/prisma.module';

import { OptionalAuthGuard } from './guards/optional-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { SupabaseService } from './supabase.service';

@Module({
  // PrismaModule is needed by SupabaseAuthGuard to enforce
  // public.users.status === 'active' on every authenticated request, so a
  // suspended/deleted user can't keep using a still-valid JWT.
  imports: [ConfigModule, PrismaModule],
  providers: [
    SupabaseService,
    SupabaseAuthGuard,
    OptionalAuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [SupabaseService, SupabaseAuthGuard, OptionalAuthGuard, RolesGuard],
})
export class AuthModule {}
