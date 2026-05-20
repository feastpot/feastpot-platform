import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Partial-update DTO for the T002 vendor availability fields. Every
 * field is optional - the service only writes the keys the caller
 * actually sent so a vendor can flip "same-day orders" without having
 * to re-send their full schedule.
 */
export class UpdateAvailabilityDto {
  @ApiPropertyOptional({
    description: 'Days of the week the kitchen is open. 0 = Sunday, 6 = Saturday.',
    type: [Number],
    example: [1, 2, 3, 4, 5, 6],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  openingDays?: number[];

  @ApiPropertyOptional({ description: 'Earliest slot start hour (0-23).', example: 11 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  slotOpenHour?: number;

  @ApiPropertyOptional({
    description: 'Slot close hour (1-24). Must be strictly greater than slotOpenHour.',
    example: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  slotCloseHour?: number;

  @ApiPropertyOptional({
    description: 'Hours of notice required before an order can be scheduled.',
    example: 2,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 14)
  prepLeadHours?: number;

  @ApiPropertyOptional({
    description: 'Daily order cap. null = no cap.',
    example: 25,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(10_000)
  maxOrdersPerDay?: number | null;

  @ApiPropertyOptional({
    description: 'Daily tray cap (across all orders). null = no cap.',
    example: 60,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(100_000)
  maxTraysPerDay?: number | null;

  @ApiPropertyOptional({
    description: 'Whether customers can place orders for the current calendar day.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  sameDayOrders?: boolean;

  @ApiPropertyOptional({
    description:
      'Lead time (hours) required for orders at or above largeOrderTrayThreshold. Must be paired with largeOrderTrayThreshold.',
    example: 72,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  largeOrderLeadHours?: number | null;

  @ApiPropertyOptional({
    description: 'Tray count at which largeOrderLeadHours kicks in. Pair with largeOrderLeadHours.',
    example: 20,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(10_000)
  largeOrderTrayThreshold?: number | null;

  @ApiPropertyOptional({
    description: 'When true, event orders are quoted manually and cannot be placed instantly.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  eventCateringManualQuote?: boolean;
}
