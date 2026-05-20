import { Body, Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/types';

import { MfaService } from './mfa.service';

class ConsumeRecoveryCodeDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  code!: string;
}

function requireUser(user: AuthUser | null): AuthUser {
  if (!user)
    throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
  return user;
}

/**
 * All routes require an authenticated Supabase JWT. The recovery /consume
 * route specifically expects an aal1 session (the user has signed in
 * with password but not yet completed the TOTP challenge); the
 * SupabaseAuthGuard does not distinguish, which is fine - the user can
 * always trade their own valid code for a factor removal.
 */
@ApiTags('mfa')
@ApiBearerAuth()
@Controller({ path: 'mfa/recovery-codes', version: '1' })
export class MfaController {
  constructor(private readonly svc: MfaService) {}

  @Get('status')
  @ApiOperation({ summary: 'How many unused recovery codes the caller has left' })
  status(@CurrentUser() user: AuthUser | null) {
    return this.svc.status(requireUser(user).id);
  }

  @Post('regenerate')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Generate 10 new recovery codes. Plaintext is returned ONCE; any prior unused codes are invalidated. Requires AAL2 (password + TOTP).',
  })
  regenerate(@CurrentUser() user: AuthUser | null) {
    const u = requireUser(user);
    return this.svc.regenerateCodes(u.id, u.aal ?? 'aal1').then((codes) => ({ codes }));
  }

  @Post('consume')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Consume a recovery code at sign-in time. On success, all TOTP factors are removed and the user can re-attempt sign-in without an MFA challenge.',
  })
  consume(@CurrentUser() user: AuthUser | null, @Body() dto: ConsumeRecoveryCodeDto) {
    return this.svc.consumeRecoveryCode(requireUser(user).id, dto.code);
  }
}
