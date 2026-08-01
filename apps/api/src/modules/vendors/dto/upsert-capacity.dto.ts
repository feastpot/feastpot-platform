import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

import { CapacityType } from '@prisma/client';

export class CapacityEntryDto {
  /** Calendar day the capacity applies to (vendor-local service date). */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'serviceDate must be YYYY-MM-DD' })
  serviceDate!: string;

  @IsEnum(CapacityType)
  capacityType!: CapacityType;

  @IsInt()
  @Min(1)
  @Max(1000)
  totalSlots!: number;

  /** ISO timestamp after which pre-orders close; null/omitted clears it. */
  @IsOptional()
  @IsISO8601()
  preorderCutoffAt?: string | null;
}

/**
 * PUT /v1/vendors/me/capacity — batch upsert so the dashboard's
 * "repeat weekly for 8 weeks" option lands as one atomic request
 * (8 weeks × 4 capacity types = 32 rows max, capped at 64 for headroom).
 */
export class UpsertCapacityDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => CapacityEntryDto)
  entries!: CapacityEntryDto[];
}
