import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import type { AuthUser } from '../types';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser | null => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser | null }>();
    return request.user ?? null;
  },
);
