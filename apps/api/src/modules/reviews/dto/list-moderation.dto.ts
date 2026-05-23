import { ApiPropertyOptional } from '@nestjs/swagger';
import { ModerationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// D18: admin needs to filter the moderation page by any status (or 'all').
// Service layer treats omitted === 'held' for backward compatibility.
export const MODERATION_QUEUE_STATUSES = [
  'all',
  ModerationStatus.auto_approved,
  ModerationStatus.held,
  ModerationStatus.approved,
  ModerationStatus.rejected,
] as const;
export type ModerationQueueStatus = (typeof MODERATION_QUEUE_STATUSES)[number];

export class ListModerationQueueDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(/^[A-Za-z0-9_\-=]+$/)
  cursor?: string;

  @ApiPropertyOptional({ enum: MODERATION_QUEUE_STATUSES })
  @IsOptional()
  @IsIn(MODERATION_QUEUE_STATUSES as readonly string[])
  status?: ModerationQueueStatus;

  // ---- additional admin filters (D21) ---------------------------------

  @ApiPropertyOptional({ description: 'Free-text search on review title/body, customer name/email, vendor name.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Restrict to a single vendor id (UUID).' })
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Exact star rating.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiPropertyOptional({ description: 'Submitted at lower bound — ISO8601' })
  @IsOptional()
  @IsDateString()
  submittedFrom?: string;

  @ApiPropertyOptional({ description: 'Submitted at upper bound — ISO8601' })
  @IsOptional()
  @IsDateString()
  submittedTo?: string;
}
