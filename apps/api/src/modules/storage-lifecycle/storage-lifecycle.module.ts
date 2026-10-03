import {
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Global,
  Injectable,
  Module,
  NestInterceptor,
  Post,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { mergeMap } from 'rxjs';

import { AuthModule } from '../../auth/auth.module';
import { Roles } from '../../auth/decorators/roles.decorator';
import { PrismaModule } from '../../prisma/prisma.module';

import { StorageLifecycleService } from './storage-lifecycle.service';

@Injectable()
class StorageCleanupInterceptor implements NestInterceptor {
  constructor(private readonly lifecycle: StorageLifecycleService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<{ method: string; url: string }>();
    const method = request.method;
    if (request.url.startsWith('/v1/admin/storage-reconciliation')) return next.handle();
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next.handle();
    // Payment webhooks and unrelated writes must not wait for storage maintenance.
    const path = request.url.split('?')[0];
    if (
      !/(?:^|\/)(?:vendors|users|menus|menu-items|reviews|documents|vendor-applications|menu-imports|referral-links|referrals|disputes|evidence)(?:\/|$)/.test(
        path,
      )
    )
      return next.handle();
    return next.handle().pipe(
      mergeMap(async (result: unknown) => {
        await this.lifecycle.drain();
        return result;
      }),
    );
  }
}

@Controller({ path: 'admin/storage-reconciliation', version: '1' })
@Roles(UserRole.admin, UserRole.compliance)
class StorageReconciliationController {
  constructor(private readonly lifecycle: StorageLifecycleService) {}
  @Get('latest') latest() {
    return this.lifecycle.latest();
  }
  @Post('report') report() {
    return this.lifecycle.report();
  }
}

@Global()
@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [StorageReconciliationController],
  providers: [
    StorageLifecycleService,
    { provide: APP_INTERCEPTOR, useClass: StorageCleanupInterceptor },
  ],
  exports: [StorageLifecycleService],
})
export class StorageLifecycleModule {}
