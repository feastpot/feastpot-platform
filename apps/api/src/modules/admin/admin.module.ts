import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StripeModule } from '../../stripe/stripe.module';
import { PaymentsModule } from '../payments/payments.module';
import { TermsModule } from '../terms/terms.module';

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
 * TermsModule is imported so the commission rate creation endpoint can wire
 * into the legal notice engine (P2B Regulation: rate changes must trigger
 * the 15-day notice flow).
 *
 * NotificationsModule + LoyaltyModule are both @Global() so they don't
 * appear here - feature modules can inject NotificationsService /
 * EmailProvider / LoyaltyService directly.
 */
@Module({
  // PaymentsModule provides PaymentsService for the admin refund endpoints.
  imports: [PrismaModule, StripeModule, AuthModule, ConfigModule, TermsModule, PaymentsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminUsersService, DlqMonitorService],
})
export class AdminModule {}
