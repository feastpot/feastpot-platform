import { ALLERGEN_FREE_SLUGS, DIETARY_PREFERENCE_SLUGS } from '@feastpot/config/allergens';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OrderType, VendorStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';


export enum VendorSortBy {
  rating = 'rating',
  distance = 'distance',
  reorderRate = 'reorderRate',
}

const toBool = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

const toArray = ({ value }: { value: unknown }): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.length) return value.split(',').map((s) => s.trim());
  return value;
};

const toArrayNormalised = ({ value }: { value: unknown }): unknown => {
  if (Array.isArray(value))
    return value.map((s) => (typeof s === 'string' ? s.toLowerCase().trim() : s));
  if (typeof value === 'string' && value.length)
    return value
      .split(',')
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean);
  return value;
};

export class SearchVendorsDto {
  @ApiPropertyOptional({
    description:
      'Free-text query - matches business name, description, cuisine list, AND active menu-item names/descriptions',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ description: 'UK postcode (full or outward), e.g. "SE15" or "SE15 4QF"' })
  @IsOptional()
  @IsString()
  postcode?: string;

  @ApiPropertyOptional({ type: [String], description: 'Cuisine filter (any of)' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsString({ each: true })
  cuisine?: string[];

  @ApiPropertyOptional({ description: 'Only vendors offering halal items' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  halal?: boolean;

  @ApiPropertyOptional({ enum: OrderType })
  @IsOptional()
  @IsEnum(OrderType)
  orderType?: OrderType;

  @ApiPropertyOptional({
    enum: VendorStatus,
    default: VendorStatus.live,
    description:
      'Filter by vendor lifecycle status. Defaults to `live` so the customer-facing search continues to hide pending/suspended vendors. Admin tools may pass other values to surface the full pipeline.',
  })
  @IsOptional()
  @IsEnum(VendorStatus)
  status?: VendorStatus = VendorStatus.live;

  @ApiPropertyOptional({ description: 'Filter to community-favourite vendors (rating >= 4.3)' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  communityFavourite?: boolean;

  @ApiPropertyOptional({
    description:
      'Maximum distance from the requesting postcode, in kilometres. Only applied when `postcode` is set AND geocoding succeeds; vendors without geocoded delivery coordinates are excluded from the radius filter (no silent prefix-proxy fallback).',
    minimum: 0.1,
    maximum: 500,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(500)
  maxDistanceKm?: number;

  @ApiPropertyOptional({ enum: VendorSortBy, default: VendorSortBy.rating })
  @IsOptional()
  @IsEnum(VendorSortBy)
  sortBy?: VendorSortBy = VendorSortBy.rating;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    type: [String],
    enum: [...ALLERGEN_FREE_SLUGS],
    description:
      'Allergen-free filter (comma-separated FSA 14 canonical slugs). Returns vendors that have ' +
      'at least one menu item whose declared allergens array is non-empty AND does not overlap the ' +
      'requested set. Items with empty or missing allergens are never treated as allergen-free. ' +
      'Multiple values apply AND semantics: the qualifying dish must be free of ALL listed allergens.',
  })
  @IsOptional()
  @Transform(toArrayNormalised)
  @IsArray()
  @IsIn([...ALLERGEN_FREE_SLUGS], { each: true })
  allergenFree?: string[];

  @ApiPropertyOptional({
    type: [String],
    enum: [...DIETARY_PREFERENCE_SLUGS],
    description:
      'Dietary-preference filter (comma-separated). Returns vendors with at least one dish ' +
      'declared with the matching lifestyle flag. This is NOT an allergen-safety claim.',
  })
  @IsOptional()
  @Transform(toArrayNormalised)
  @IsArray()
  @IsIn([...DIETARY_PREFERENCE_SLUGS], { each: true })
  dietaryPreferences?: string[];

  @ApiPropertyOptional({ description: 'Opaque cursor returned by previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(/^[A-Za-z0-9_\-=]+$/, { message: 'cursor must be base64url' })
  cursor?: string;
}
