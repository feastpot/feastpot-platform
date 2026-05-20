import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SupabaseService } from '../../auth/supabase.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Self-serve TOTP recovery codes.
 *
 * Supabase MFA does NOT ship recovery codes, so we run the lifecycle
 * ourselves. The Supabase user.id is the authoritative key (the row in
 * `auth.users` is the same UUID as our `public.users.id` via the
 * matching trigger), so we never need to look up a `public.users` row
 * to use these endpoints - which matters because a brand-new vendor
 * who just signed up may not yet have a `public.users` row populated.
 *
 * ## Hashing
 * We use HMAC-SHA256 with a server-only pepper. Recovery codes carry
 * ~50 bits of entropy (10 base32 chars), so a slow KDF (bcrypt/argon)
 * is not necessary - HMAC dominates the cost of the SQL roundtrip. The
 * pepper means a leaked DB dump alone cannot brute the codes; an
 * attacker also needs the service-role secret.
 *
 * Pepper source priority:
 *   1. `MFA_RECOVERY_PEPPER` env (if you want to rotate it independently)
 *   2. `SUPABASE_SERVICE_ROLE_KEY` (always present in this codebase)
 * Rotating the pepper invalidates all existing codes; document this.
 */

const CODE_COUNT = 10;
// 10 base32 chars = 50 bits of entropy. Hyphen in the middle is for
// human-readable display only and is stripped before hashing so users
// don't have to be perfect about it.
const CODE_BYTES = 8; // 8 bytes -> 13 base32 chars; we slice to 10.
const BASE32 = 'abcdefghijkmnpqrstuvwxyz23456789'; // Crockford-ish, no 0/1/o/l

function encodeBase32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function generateOneCode(): string {
  const raw = encodeBase32(randomBytes(CODE_BYTES)).slice(0, 10);
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
}

/**
 * Normalise user input so "abcde-fghij", "ABCDE FGHIJ" and "abcdefghij"
 * all hash to the same digest.
 */
function normaliseCode(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
  ) {
    this.pepper =
      this.config.get<string>('MFA_RECOVERY_PEPPER') ??
      this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY') ??
      '';
    if (!this.pepper) {
      this.logger.warn(
        'No MFA recovery pepper available (set MFA_RECOVERY_PEPPER or SUPABASE_SERVICE_ROLE_KEY) - recovery codes will be hashed with an empty pepper and are NOT safe in production.',
      );
    }
  }

  private hash(code: string): string {
    return createHmac('sha256', this.pepper).update(normaliseCode(code)).digest('hex');
  }

  /**
   * Generate (or regenerate) 10 codes for the user. Any existing UNUSED
   * codes are deleted so a leaked older set cannot be used after
   * regeneration. Used (consumed) codes are kept for audit but cannot
   * be used again (`usedAt IS NOT NULL`).
   *
   * REQUIRES aal2 (password + TOTP completed in the current session).
   * Without this gate, a stolen password alone (aal1) would be enough
   * to mint a fresh recovery code and then call /consume to drop the
   * legitimate user's TOTP factor, completely defeating 2FA.
   */
  async regenerateCodes(userId: string, aal: 'aal1' | 'aal2'): Promise<string[]> {
    if (aal !== 'aal2') {
      throw new ForbiddenException({
        code: 'MFA_AAL2_REQUIRED',
        message:
          'You must complete a 2FA challenge in this session before generating recovery codes.',
      });
    }
    const codes = Array.from({ length: CODE_COUNT }, generateOneCode);
    const rows = codes.map((c) => ({ userId, codeHash: this.hash(c) }));
    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId, usedAt: null } }),
      this.prisma.mfaRecoveryCode.createMany({ data: rows }),
    ]);
    return codes;
  }

  /**
   * Returns { remaining } - number of UNUSED codes. The vendor security
   * UI uses this to show "7 of 10 codes left" without ever asking for
   * the plaintext (which we cannot return after generation).
   */
  async status(userId: string): Promise<{ remaining: number; total: number }> {
    const [remaining, total] = await Promise.all([
      this.prisma.mfaRecoveryCode.count({ where: { userId, usedAt: null } }),
      this.prisma.mfaRecoveryCode.count({ where: { userId } }),
    ]);
    return { remaining, total };
  }

  /**
   * Sign-in recovery path. The user has completed password sign-in but
   * cannot pass the TOTP challenge (lost device etc.). They paste a
   * recovery code; we:
   *   1. constant-time look up the matching unused row
   *   2. mark it usedAt = now()
   *   3. ask Supabase admin API to delete EVERY MFA factor on the user
   *      so the next sign-in will go straight through
   *
   * Returns 200 with `{ ok: true }`. The client then re-runs
   * signInWithPassword (no MFA prompt this time) and lands in the app.
   */
  async consumeRecoveryCode(userId: string, rawCode: string): Promise<{ ok: true }> {
    const normalised = normaliseCode(rawCode);
    if (normalised.length < 8) {
      throw new BadRequestException({ code: 'INVALID_CODE', message: 'Recovery code is too short.' });
    }

    const targetHash = this.hash(rawCode);
    // timingSafeEqual is constant-time, but we still touch every row to
    // avoid early-exit timing leaks based on row position. Volume is
    // bounded (max 10 active codes per user) so this loop is cheap.
    const candidates = await this.prisma.mfaRecoveryCode.findMany({
      where: { userId, usedAt: null },
      select: { id: true, codeHash: true },
    });
    const targetBuf = Buffer.from(targetHash, 'hex');
    let matchId: string | null = null;
    for (const row of candidates) {
      const rowBuf = Buffer.from(row.codeHash, 'hex');
      const eq =
        rowBuf.length === targetBuf.length && timingSafeEqual(rowBuf, targetBuf);
      if (eq && !matchId) matchId = row.id;
    }
    if (!matchId) {
      throw new NotFoundException({
        code: 'RECOVERY_CODE_INVALID',
        message: 'That recovery code is not recognised or has already been used.',
      });
    }

    // ATOMIC consume: claim the row in a single SQL statement guarded
    // on `usedAt IS NULL`. Two concurrent /consume calls with the same
    // code can both pass the in-memory match above, but only one
    // updateMany can flip usedAt from NULL -> now() - the loser sees
    // `count === 0` and is treated as "already used".
    const claim = await this.prisma.mfaRecoveryCode.updateMany({
      where: { id: matchId, userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claim.count !== 1) {
      throw new NotFoundException({
        code: 'RECOVERY_CODE_INVALID',
        message: 'That recovery code is not recognised or has already been used.',
      });
    }

    // Delete every TOTP factor on the user. We list first because the
    // admin API requires the factor id and there can be at most one
    // verified factor in normal usage but multiple unverified ones if
    // the user abandoned an enrolment.
    //
    // FAIL CLOSED: if listFactors OR any deleteFactor returns an error,
    // we throw a 500 and DO NOT wipe the remaining recovery codes.
    // Reporting success while 2FA is still active would leave the user
    // permanently locked out (their code is burned and the auth app is
    // still required) - far worse than asking them to retry or contact
    // support, because at least their other codes still work.
    const admin = this.supabase.getClient();
    const factorsRes = await admin.auth.admin.mfa.listFactors({ userId });
    if (factorsRes.error) {
      this.logger.error(
        `Recovery code consumed for user ${userId} but listFactors failed: ${factorsRes.error.message}.`,
      );
      throw new InternalServerErrorException({
        code: 'MFA_RESET_FAILED',
        message:
          'Recovery code accepted but we could not finish removing 2FA. Please try again in a moment - your other recovery codes still work.',
      });
    }
    const factors = factorsRes.data?.factors ?? [];
    for (const f of factors) {
      const del = await admin.auth.admin.mfa.deleteFactor({ userId, id: f.id });
      if (del.error) {
        this.logger.error(
          `deleteFactor(${f.id}) for user ${userId} failed after recovery-code consume: ${del.error.message}`,
        );
        throw new InternalServerErrorException({
          code: 'MFA_RESET_FAILED',
          message:
            'Recovery code accepted but we could not fully remove 2FA. Please try again - your other recovery codes still work.',
        });
      }
    }

    // Only now that every factor is confirmed gone do we wipe the
    // remaining unused codes - the user is back to "no MFA" so they
    // shouldn't carry live codes forward.
    await this.prisma.mfaRecoveryCode.deleteMany({ where: { userId, usedAt: null } });

    return { ok: true };
  }
}
