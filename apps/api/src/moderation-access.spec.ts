import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { RolesGuard } from './auth/guards/roles.guard';
import { MenuModerationController } from './modules/catalogue/menu-moderation.controller';
import { ReviewsController } from './modules/reviews/reviews.controller';

describe('Moderation access matches the documented admin-only navigation', () => {
  const endpoints = [
    [MenuModerationController, 'queue'],
    [MenuModerationController, 'queueCounts'],
    [ReviewsController, 'queue'],
    [ReviewsController, 'exportQueueCsv'],
    [ReviewsController, 'queueCounts'],
  ] as const;

  for (const [controller, method] of endpoints) {
    for (const role of Object.values(UserRole)) {
      it(`${controller.name}.${method}: ${role}`, () => {
        const context = {
          getHandler: () => Reflect.get(controller.prototype, method),
          getClass: () => controller,
          switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
        } as unknown as ExecutionContext;
        const guard = new RolesGuard(new Reflector());
        if (role === UserRole.admin) expect(guard.canActivate(context)).toBe(true);
        else expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      });
    }
  }
});
