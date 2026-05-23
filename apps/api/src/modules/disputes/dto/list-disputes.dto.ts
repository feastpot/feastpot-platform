import { ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeStatus, Severity } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export type SlaFilter = 'all' | 'overdue' | 'breaching_soon' | 'on_track' | 'resolved';
export const SLA_FILTERS: ReadonlyArray<SlaFilter> = [
  'all',
  'overdue',
  'breaching_soon',
  'on_track',
  'resolved',
];

export class ListDisputesDto {
  @ApiPropertyOptional({ enum: DisputeStatus })
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;

  @ApiPropertyOptional({ enum: Severity })
  @IsOptional()
  @IsEnum(Severity)
  severity?: Severity;

  @ApiPropertyOptional({
    description:
      'CSV of severities (e.g. "high,medium") to OR-filter on. Takes precedence over single `severity`.',
    type: String,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return undefined;
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  })
  @IsArray()
  @IsEnum(Severity, { each: true })
  severities?: Severity[];

  @ApiPropertyOptional({
    description: 'SLA bucket derived from createdAt + vendorRespondedAt + resolvedAt',
    enum: SLA_FILTERS,
  })
  @IsOptional()
  @IsIn(SLA_FILTERS as readonly string[])
  sla?: SlaFilter;

  @ApiPropertyOptional({ description: 'Free-text search across order number, vendor and customer name' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'ISO date - include only disputes created on/after this date' })
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'ISO date - include only disputes created on/before this date (end of day UTC)' })
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional({ description: 'Filter to disputes assigned to this support agent' })
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

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
}
