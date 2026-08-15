import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { SupabaseAuthGuard } from '../../auth/guards/supabase-auth.guard';
import type { AuthUser } from '../../auth/types';

import { AuthPublicService } from './auth-public.service';
import { ResetRequestDto } from './dto/reset-request.dto';

@Controller('auth')
export class AuthPublicController {
  constructor(private readonly authPublicService: AuthPublicService) {}

  /**
   * POST /v1/auth/reset-request
   *
   * Triggers a Supabase password-reset email for the given address.
   * Applies rate limiting (per-IP via @Throttle, per-email in the service).
   * Always returns 200 OK regardless of whether the email is registered,
   * so attackers cannot enumerate accounts via the response.
   *
   * @Public() skips SupabaseAuthGuard - this endpoint must be reachable
   * without a session (the user is, by definition, locked out).
   *
   * @Throttle limits this endpoint to 5 requests per minute per IP,
   * stricter than the default throttler applied to authed routes. The
   * inner per-email limit (3 per hour) lives in AuthPublicService.
   */
  @Public()
  @Post('reset-request')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetRequest(@Body() dto: ResetRequestDto): Promise<{ sent: boolean }> {
    // Fire-and-forget internally; always surfaces as { sent: true }
    await this.authPublicService.resetRequest(dto.email, dto.app);
    return { sent: true };
  }

  /**
   * POST /v1/auth/notify-password-changed
   *
   * Sends a branded "your password was changed" advisory email to the
   * currently authenticated user. Called by the web and vendor reset-update
   * pages immediately after `supabase.auth.updateUser({ password })` succeeds.
   *
   * Auth-guarded: the client must supply `Authorization: Bearer <access_token>`
   * obtained from `supabase.auth.getSession()` after the password update.
   * This prevents third parties from spamming arbitrary inboxes.
   */
  @UseGuards(SupabaseAuthGuard)
  @Post('notify-password-changed')
  @HttpCode(HttpStatus.OK)
  async notifyPasswordChanged(@CurrentUser() user: AuthUser): Promise<{ notified: boolean }> {
    const email = user.email ?? (user as any).user_metadata?.email;
    if (email) {
      await this.authPublicService.notifyPasswordChanged(email);
    }
    return { notified: !!email };
  }
}
