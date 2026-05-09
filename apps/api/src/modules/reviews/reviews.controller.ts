import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../auth/types';

import { CreateReviewDto } from './dto/create-review.dto';
import { ListModerationQueueDto } from './dto/list-moderation.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';
import { ReviewsService } from './reviews.service';

function requireUser(user: AuthUser | null): AuthUser {
  if (!user) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
  return user;
}

@ApiTags('Reviews')
@ApiBearerAuth()
@Controller({ path: 'reviews', version: '1' })
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post()
  @Roles(UserRole.customer)
  @ApiOperation({ summary: 'Submit a review (customer; order must be delivered)' })
  create(@CurrentUser() user: AuthUser | null, @Body() dto: CreateReviewDto) {
    return this.reviews.create(dto, requireUser(user));
  }

  @Get('moderation-queue')
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'List reviews held for moderation (admin/support)' })
  queue(@Query() dto: ListModerationQueueDto) {
    return this.reviews.listModerationQueue(dto);
  }

  @Patch(':id/moderation')
  @Roles(UserRole.admin)
  @ApiOperation({ summary: 'Approve or reject a held review (admin)' })
  moderate(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser | null,
    @Body() dto: ModerateReviewDto,
  ) {
    return this.reviews.moderate(id, dto, requireUser(user));
  }
}
