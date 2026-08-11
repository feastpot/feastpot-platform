import { Module } from '@nestjs/common';

import { AuthPublicController } from './auth-public.controller';
import { AuthPublicService } from './auth-public.service';

/**
 * AuthPublicModule - password-reset request and post-reset notifications.
 *
 * Deliberately separate from AuthModule (which handles guards, decorators
 * and the SupabaseService) to keep the public-facing password-flow thin
 * and independently testable.
 */
@Module({
  controllers: [AuthPublicController],
  providers: [AuthPublicService],
})
export class AuthPublicModule {}
