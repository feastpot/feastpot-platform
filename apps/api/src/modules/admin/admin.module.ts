import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StripeModule } from '../../stripe/stripe.module';

import { AdminUsersService } from './admin-users.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DlqMonitorService } from './dlq-monitor.service';

/**
 * AuthModule is imported so AdminUsersService can use SupabaseService for
 * server-side global sign-outs when an admin suspends a user, AND so that
 * AdminService can use it for auth-user creation in the vendor application
 * approval flow.
 *
 * NotificationsModule + LoyaltyModule are both @Global() so they don't
 * appear here - feature modules can inject NotificationsService /
 * EmailProvider / LoyaltyService directly.
 */
@Module({
  imports: [PrismaModule, StripeModule, AuthModule, ConfigModule],
  controllers: [AdminController],
  providers: [AdminService, AdminUsersService, DlqMonitorService],
})
export class AdminModule {}
