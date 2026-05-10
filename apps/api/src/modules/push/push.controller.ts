import {
  Body,
  ConflictException,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthedRequest, AuthUser } from '../../auth/types';
import { PrismaService } from '../../prisma/prisma.service';

import { SubscribePushDto, UnsubscribePushQueryDto } from './dto/subscribe.dto';

function requireUser(req: AuthedRequest): AuthUser {
  if (!req.user) throw new Error('No authenticated user');
  return req.user;
}

@ApiTags('Push')
@ApiBearerAuth()
@Controller({ path: 'push', version: '1' })
export class PushController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent subscribe.
   *
   * Endpoints are produced fresh per device + per subscription rotation, so a
   * unique constraint on `endpoint` lets the same device upsert without
   * juggling client state.
   *
   * SECURITY: we deliberately do NOT silently re-bind an endpoint that's
   * already owned by another user. Endpoints have very high entropy so
   * collision is implausible in practice, but if one ever leaked (logs,
   * error reports) a malicious authed user could otherwise hijack delivery
   * of push messages intended for the original owner. We surface a 409
   * instead — the client can prompt the user to unsubscribe + resubscribe
   * locally if they really intend to switch accounts on a shared device.
   */
  @Post('subscribe')
  @Roles(UserRole.customer, UserRole.vendor, UserRole.admin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a Web Push subscription for the signed-in user' })
  async subscribe(@Req() req: AuthedRequest, @Body() dto: SubscribePushDto) {
    const user = requireUser(req);

    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: dto.endpoint },
      select: { id: true, userId: true },
    });

    if (existing && existing.userId !== user.id) {
      throw new ConflictException(
        'This push endpoint is already registered to a different account.',
      );
    }

    const sub = await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId: user.id,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent ?? null,
      },
      update: {
        // userId intentionally NOT updated here — the ownership check above
        // already enforced that `existing.userId === user.id` when present.
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        userAgent: dto.userAgent ?? null,
      },
      select: { id: true, endpoint: true, createdAt: true },
    });
    return sub;
  }

  /**
   * Unsubscribe by endpoint (the only opaque ID the browser knows about).
   * Scoped to `userId` so a user can only delete their own subscriptions —
   * even if the endpoint string somehow leaked. Returns 204 whether or not
   * the row existed; both states are "no longer subscribed".
   */
  @Delete('unsubscribe')
  @Roles(UserRole.customer, UserRole.vendor, UserRole.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a Web Push subscription by endpoint' })
  async unsubscribe(@Req() req: AuthedRequest, @Query() query: UnsubscribePushQueryDto) {
    const user = requireUser(req);
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint: query.endpoint, userId: user.id },
    });
  }
}
