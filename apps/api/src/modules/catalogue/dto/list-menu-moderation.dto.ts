import { ApiPropertyOptional } from '@nestjs/swagger';
import { ModerationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

// Admin filters the moderation page by any status (or 'all'). Service treats an
// omitted status as 'held' (the items actually awaiting a decision).
export const MENU_MODERATION_STATUSES = [
  'all',
  ModerationStatus.auto_approved,
  ModerationStatus.held,
  ModerationStatus.approved,
  ModerationStatus.rejected,
] as const;
export type MenuModerationStatus = (typeof MENU_MODERATION_STATUSES)[number];

export class ListMenuModerationDto {
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

  @ApiPropertyOptional({ enum: MENU_MODERATION_STATUSES })
  @IsOptional()
  @IsIn(MENU_MODERATION_STATUSES as readonly string[])
  status?: MenuModerationStatus;

  @ApiPropertyOptional({ description: 'Free-text search on item name/description or vendor name.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Restrict to a single vendor id (UUID).' })
  @IsOptional()
  @IsUUID()
  vendorId?: string;
}
