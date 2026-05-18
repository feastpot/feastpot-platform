import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import type { User } from '@supabase/supabase-js';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SupabaseService } from '../supabase.service';

import { SupabaseAuthGuard, extractBearerToken, mapUser } from './supabase-auth.guard';

function ctxWith(headers: Record<string, string>, holder: { user?: unknown }): ExecutionContext {
  const request = Object.assign(holder, { headers });
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class C {},
  } as unknown as ExecutionContext;
}

describe('extractBearerToken', () => {
  it('returns the token when valid', () => {
    expect(extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });
  it('returns null on missing or wrong scheme', () => {
    expect(extractBearerToken(undefined)).toBeNull();
    expect(extractBearerToken('Basic xxx')).toBeNull();
    expect(extractBearerToken('Bearer ')).toBeNull();
  });
});

function makeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

describe('mapUser', () => {
  it('reads role from verified JWT claim (set by custom_access_token_hook)', () => {
    const user = {
      id: '11111111-1111-1111-1111-111111111111',
      email: 'a@b.com',
      app_metadata: {},
      user_metadata: {},
    } as unknown as User;
    const token = makeJwt({ sub: user.id, role: 'admin' });
    expect(mapUser(user, token)).toEqual({ id: user.id, email: user.email, role: UserRole.admin });
  });

  it('falls back to app_metadata.role when JWT claim missing', () => {
    const user = {
      id: 'x',
      email: 'a@b.com',
      app_metadata: { role: 'finance' },
      user_metadata: {},
    } as unknown as User;
    const token = makeJwt({ sub: 'x' });
    expect(mapUser(user, token).role).toBe(UserRole.finance);
  });

  it('SECURITY: ignores user_metadata.role to prevent privilege escalation', () => {
    const user = {
      id: 'x',
      email: 'a@b.com',
      app_metadata: {},
      user_metadata: { role: 'admin' },
    } as unknown as User;
    const token = makeJwt({ sub: 'x' });
    expect(mapUser(user, token).role).toBe(UserRole.customer);
  });

  it('REGRESSION: skips JWT top-level "authenticated" and uses app_metadata.role', () => {
    // Without the custom_access_token_hook installed, Supabase sets
    // top-level role="authenticated" by default. The guard must not treat
    // that as our app role - it has to fall through to app_metadata.role,
    // otherwise every authenticated user collapses to "customer" and
    // privileged endpoints become unreachable.
    const user = {
      id: 'x',
      email: 'a@b.com',
      app_metadata: { role: 'vendor' },
      user_metadata: {},
    } as unknown as User;
    const token = makeJwt({ sub: 'x', role: 'authenticated' });
    expect(mapUser(user, token).role).toBe(UserRole.vendor);
  });

  it('EDGE: empty-string JWT role falls through to app_metadata.role', () => {
    const user = {
      id: 'x', email: 'a@b.com',
      app_metadata: { role: 'admin' }, user_metadata: {},
    } as unknown as User;
    expect(mapUser(user, makeJwt({ sub: 'x', role: '' })).role).toBe(UserRole.admin);
  });

  it('EDGE: non-string JWT role (number) falls through to app_metadata.role', () => {
    const user = {
      id: 'x', email: 'a@b.com',
      app_metadata: { role: 'finance' }, user_metadata: {},
    } as unknown as User;
    expect(mapUser(user, makeJwt({ sub: 'x', role: 42 })).role).toBe(UserRole.finance);
  });

  it('EDGE: null app_metadata defaults to customer when no JWT role', () => {
    const user = {
      id: 'x', email: 'a@b.com',
      app_metadata: null as unknown as Record<string, unknown>,
      user_metadata: {},
    } as unknown as User;
    expect(mapUser(user, makeJwt({ sub: 'x' })).role).toBe(UserRole.customer);
  });

  it('falls back to customer for unknown role string', () => {
    const user = {
      id: 'x',
      email: 'a@b.com',
      app_metadata: {},
      user_metadata: {},
    } as unknown as User;
    const token = makeJwt({ sub: 'x', role: 'super_duper' });
    expect(mapUser(user, token).role).toBe(UserRole.customer);
  });

  it('throws when no email', () => {
    const user = { id: 'x', app_metadata: {}, user_metadata: {} } as unknown as User;
    expect(() => mapUser(user, makeJwt({ sub: 'x' }))).toThrow(UnauthorizedException);
  });
});

describe('SupabaseAuthGuard', () => {
  const supabase = {
    verifyToken: jest.fn(),
  } as unknown as jest.Mocked<SupabaseService>;
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ status: 'active' }) },
  } as unknown as jest.Mocked<PrismaService>;
  const reflector = new Reflector();
  const guard = new SupabaseAuthGuard(reflector, supabase, prisma);

  beforeEach(() => jest.clearAllMocks());

  it('allows public routes without token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(true);
    const holder: { user?: unknown } = {};
    const ok = await guard.canActivate(ctxWith({}, holder));
    expect(ok).toBe(true);
    expect(supabase.verifyToken).not.toHaveBeenCalled();
  });

  it('throws when token missing', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(false);
    await expect(guard.canActivate(ctxWith({}, {}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches mapped user when token valid', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValueOnce(false);
    (supabase.verifyToken as jest.Mock).mockResolvedValueOnce({
      id: 'u1',
      email: 'u1@x.com',
      app_metadata: {},
      user_metadata: {},
    });
    const holder: { user?: unknown } = {};
    const goodToken = `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'u1', role: 'vendor' })).toString('base64url')}.sig`;
    const ok = await guard.canActivate(ctxWith({ authorization: `Bearer ${goodToken}` }, holder));
    expect(ok).toBe(true);
    expect(holder.user).toEqual({ id: 'u1', email: 'u1@x.com', role: UserRole.vendor });
  });

  it('uses IS_PUBLIC_KEY to detect public', () => {
    expect(IS_PUBLIC_KEY).toBe('isPublic');
  });
});
