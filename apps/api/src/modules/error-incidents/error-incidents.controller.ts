import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';

import { Public } from '../../auth/decorators/public.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { OptionalAuthGuard } from '../../auth/guards/optional-auth.guard';
import type { AuthedRequest } from '../../auth/types';

import { CreateErrorIncidentDto } from './dto/create-error-incident.dto';
import { ErrorIncidentsService } from './error-incidents.service';

/**
 * Error incident endpoints.
 *
 * POST /error-incidents  - public (no auth), rate-limited by the global
 *   RoleThrottlerGuard. Called by vendor/web/admin error boundaries to persist
 *   a real, searchable incident ref. Errors can happen before login so no auth
 *   is required.
 *
 * GET  /error-incidents  - staff only. Lists recent incidents or searches by
 *   ?ref=FP-XXXX-XXXX.
 *
 * GET  /error-incidents/:ref - staff only. Fetches a single incident by ref.
 */
@Controller({ path: 'error-incidents', version: '1' })
export class ErrorIncidentsController {
  constructor(private readonly service: ErrorIncidentsService) {}

  /**
   * Public: no auth. Strictly rate-limited by the global RoleThrottlerGuard
   * (anonymous cap: 30 req/min). Genuinely harmless spam is the worst case.
   */
  @Public()
  @UseGuards(OptionalAuthGuard)
  @Post()
  async create(
    @Body() dto: CreateErrorIncidentDto,
    @Req() req: Request & AuthedRequest,
  ): Promise<{ ref: string }> {
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? undefined;
    const incident = await this.service.create(dto, req.user ?? null, userAgent);
    return { ref: incident.ref };
  }

  @Roles(UserRole.admin, UserRole.support, UserRole.compliance, UserRole.finance)
  @Get()
  async list(@Query('ref') ref?: string, @Query('limit') limit?: string) {
    if (ref) {
      const incident = await this.service.findByRef(ref.toUpperCase());
      if (!incident) throw new NotFoundException(`No incident found for ref ${ref}`);
      return incident;
    }
    return this.service.listRecent(limit ? Math.min(parseInt(limit, 10), 200) : 50);
  }

  @Roles(UserRole.admin, UserRole.support, UserRole.compliance, UserRole.finance)
  @Get(':ref')
  async findOne(@Param('ref') ref: string) {
    const incident = await this.service.findByRef(ref.toUpperCase());
    if (!incident) throw new NotFoundException(`No incident found for ref ${ref}`);
    return incident;
  }
}
