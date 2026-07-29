import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Header,
  Query,
  Res,
  UnauthorizedException,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../auth/types';

import { CreateReviewDto } from './dto/create-review.dto';
import { ListModerationQueueDto } from './dto/list-moderation.dto';
import { ModerateReviewDto } from './dto/moderate-review.dto';
import { ReviewsService } from './reviews.service';

function requireUser(user: AuthUser | null): AuthUser {
  if (!user)
    throw new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'Authentication required',
    });
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

  @Post(':id/photos')
  @Roles(UserRole.customer)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        photos: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @UseInterceptors(FilesInterceptor('photos', 3, { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Attach up to 3 photos to your review (max 5MB each; jpeg/png/webp)' })
  addPhotos(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser | null,
    @UploadedFiles() photos: Express.Multer.File[] | undefined,
  ) {
    return this.reviews.addPhotos(id, photos ?? [], requireUser(user));
  }

  @Get('moderation-queue')
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({ summary: 'List reviews held for moderation (admin/support)' })
  queue(@Query() dto: ListModerationQueueDto) {
    return this.reviews.listModerationQueue(dto);
  }

  @Get('moderation-queue.csv')
  @Roles(UserRole.admin, UserRole.support)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="reviews-moderation.csv"')
  @ApiOperation({
    summary: 'CSV export of the moderation queue (honours filters, capped at 5 000 rows)',
  })
  async exportQueueCsv(@Query() dto: ListModerationQueueDto, @Res() res: Response) {
    res.flushHeaders?.();
    await this.reviews.exportModerationCsv(dto, (chunk) => {
      res.write(chunk);
    });
    res.end();
  }

  @Get('moderation-queue/counts')
  @Roles(UserRole.admin, UserRole.support)
  @ApiOperation({
    summary: 'Counts per moderation status honouring current filters (admin/support)',
  })
  queueCounts(@Query() dto: ListModerationQueueDto) {
    return this.reviews.moderationQueueCounts(dto);
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
