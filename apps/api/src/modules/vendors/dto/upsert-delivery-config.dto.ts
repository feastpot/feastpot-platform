import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { DeliveryType } from '@prisma/client';

/**
 * Upsert payload for a vendor's delivery configuration.
 *
 * Mirrors the (limited) DeliveryConfig schema columns. Fields requested by
 * the vendor portal spec but absent from the schema (lead time, available
 * days, slot windows, max-advance-booking) are intentionally NOT accepted
 * here - silently dropping them would mislead the UI. Add them via a
 * follow-up migration when scheduled-orders ships.
 */
export class UpsertDeliveryConfigDto {
  @ApiProperty({ enum: DeliveryType, isArray: true, description: 'One or more delivery modes' })
  @IsArray()
  @ArrayUnique()
  @IsEnum(DeliveryType, { each: true })
  types!: DeliveryType[];

  @ApiPropertyOptional({ minimum: 1, default: 5, description: 'Local delivery radius in miles' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  localRadiusMiles?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0, description: 'Local delivery flat fee in pence' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  localFeePence?: number;

  @ApiPropertyOptional({ description: 'Address for collection orders' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  collectionAddress?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  nationwideEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  nationwideFeePence?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0, description: 'Minimum order value in pence' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrderPence?: number;

  // Explicit `null` (or omission) disables free delivery. We use ValidateIf
  // rather than @Type(() => Number) here because class-transformer would
  // coerce a literal `null` → 0 and silently turn "no threshold" into "free
  // for any order ≥ £0.00".
  @ApiPropertyOptional({ minimum: 0, nullable: true, description: 'Free delivery threshold in pence; null/omitted disables' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  freeDeliveryOverPence?: number | null;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 200,
    description: 'Servicing postcode prefixes (e.g. SW1, M14)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  postcodes?: string[];
}
