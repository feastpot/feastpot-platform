import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import type { SupabaseService } from '../supabase.service';

import { OptionalAuthGuard } from './optional-auth.guard';

function context(headers: Record<string, string>, request: { user?: unknown }): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => Object.assign(request, { headers }) }),
  } as unknown as ExecutionContext;
}

describe('OptionalAuthGuard', () => {
  const supabase = { verifyToken: jest.fn() } as unknown as jest.Mocked<SupabaseService>;
  const guard = new OptionalAuthGuard(supabase);

  beforeEach(() => jest.clearAllMocks());

  it('allows an absent bearer token as an anonymous report', async () => {
    const request: { user?: unknown } = {};

    await expect(guard.canActivate(context({}, request))).resolves.toBe(true);

    expect(request.user).toBeNull();
    expect(supabase.verifyToken).not.toHaveBeenCalled();
  });

  it('rejects an explicitly supplied invalid bearer token', async () => {
    (supabase.verifyToken as jest.Mock).mockRejectedValueOnce(new Error('expired'));

    await expect(
      guard.canActivate(context({ authorization: 'Bearer invalid-token' }, {})),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a malformed bearer header rather than treating it as anonymous', async () => {
    await expect(
      guard.canActivate(context({ authorization: 'Bearer ' }, {})),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
