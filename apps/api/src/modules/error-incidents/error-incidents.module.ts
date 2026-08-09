import { Module } from '@nestjs/common';

import { AuthModule } from '../../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';

import { ErrorIncidentsController } from './error-incidents.controller';
import { ErrorIncidentsService } from './error-incidents.service';

/**
 * ErrorIncidentsModule :  persists client-side error boundary exceptions so
 * that every "Ref: FP-XXXX-XXXX" shown to a vendor maps to a real, searchable
 * row in the database. Support staff can look up any ref in admin.
 *
 * The POST endpoint is public (no auth) because errors can occur before login.
 * The GET endpoints require staff roles and are registered on AdminModule's
 * controller via the shared service, injected @Global here.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ErrorIncidentsController],
  providers: [ErrorIncidentsService],
  exports: [ErrorIncidentsService],
})
export class ErrorIncidentsModule {}
