import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CapacityType } from '@prisma/client';
import { IsEnum, IsInt, IsISO8601, IsOptional, Max, Min, ValidateIf } from 'class-validator';

/**
 * Body shape for PUT /vendors/me/capacity. Upserts one
 * (serviceDate, capacityType) capacity row for the authed vendor.
 * `repeatWeeks` optionally applies the same slots/cutoff-offset to the
 * same weekday for the following N weeks so vendors can set a weekly
 * default without 12 separate calls.
 */
export class UpsertCapacityDto {
  @ApiProperty({
    description: 'Service date the capacity applies to, ISO-8601 (YYYY-MM-DD).',
    example: '2026-08-15',
  })
  @IsISO8601()
  serviceDate!: string;

  @ApiProperty({ enum: CapacityType, description: 'Order type the slots apply to.' })
  @IsEnum(CapacityType)
  capacityType!: CapacityType;

  @ApiProperty({ description: 'Total order slots for this date/type.', example: 10 })
  @IsInt()
  @Min(1)
  @Max(10_000)
  totalSlots!: number;

  @ApiPropertyOptional({
    description:
      'Optional pre-order cutoff timestamp (ISO-8601). Orders after this moment are blocked. null clears it.',
    example: '2026-08-14T18:00:00Z',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  preorderCutoffAt?: string | null;

  @ApiPropertyOptional({
    description:
      'Also upsert the same slots for the same weekday over the next N weeks (weekly default). 0 or omitted = this date only.',
    example: 4,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(12)
  repeatWeeks?: number;
}
