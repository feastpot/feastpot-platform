import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { OrderType } from '@prisma/client';

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

export class SearchVendorsDto {
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

  @ApiPropertyOptional({ description: 'Filter to community-favourite vendors (rating >= 4.3)' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  communityFavourite?: boolean;

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

  @ApiPropertyOptional({ description: 'Opaque cursor returned by previous page' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(/^[A-Za-z0-9_\-=]+$/, { message: 'cursor must be base64url' })
  cursor?: string;
}
