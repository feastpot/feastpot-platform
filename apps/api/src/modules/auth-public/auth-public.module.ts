import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';

import { AuthPublicController } from './auth-public.controller';
import { AuthPublicService } from './auth-public.service';

/**
 * AuthPublicModule - password-reset request and post-reset notifications.
 *
 * Deliberately separate from AuthModule (which handles guards, decorators
 * and the SupabaseService) to keep the public-facing password-flow thin
 * and independently testable.
 *
 * AuthModule is imported so that SupabaseAuthGuard (used on
 * notifyPasswordChanged) can resolve its SupabaseService dependency.
 */
@Module({
  imports: [AuthModule],
  controllers: [AuthPublicController],
  providers: [AuthPublicService],
})
export class AuthPublicModule {}
