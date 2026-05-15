import { ApiPropertyOptional } from '@nestjs/swagger';
import { ModerationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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
  cursor?: string;

  @ApiPropertyOptional({ enum: MODERATION_QUEUE_STATUSES })
  @IsOptional()
  @IsIn(MODERATION_QUEUE_STATUSES as readonly string[])
  status?: ModerationQueueStatus;
}
