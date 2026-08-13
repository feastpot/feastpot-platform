import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryType } from '@prisma/client';
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
  @ApiPropertyOptional({
    minimum: 0,
    nullable: true,
    description: 'Free delivery threshold in pence; null/omitted disables',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  freeDeliveryOverPence?: number | null;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 200,
    description: 'Servicing postcode districts (e.g. SW9, M14). This list is what customer search uses.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  postcodes?: string[];

  @ApiPropertyOptional({
    description: 'Kitchen/delivery-centre postcode used to geocode the vendor anchor and compute service-area districts.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  kitchenPostcode?: string;

  @ApiPropertyOptional({ description: 'Collection address line 1' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  collectionLine1?: string;

  @ApiPropertyOptional({ description: 'Collection address line 2' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  collectionLine2?: string;

  @ApiPropertyOptional({ description: 'Collection address town or city' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  collectionTown?: string;

  @ApiPropertyOptional({ description: 'Collection address postcode' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  collectionPostcode?: string;
}
