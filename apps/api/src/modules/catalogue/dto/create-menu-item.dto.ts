import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { ItemCategory } from '@prisma/client';

import { DIETARY_FLAGS, FSA_14_ALLERGENS, MAX_IMAGES_PER_ITEM } from '../catalogue.constants';

export class CreateMenuItemDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: ItemCategory })
  @IsEnum(ItemCategory)
  category!: ItemCategory;

  @ApiProperty({ minimum: 100, description: 'Base price in pence (min £1.00)' })
  @Type(() => Number)
  @IsInt()
  @Min(100)
  basePricePence!: number;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  portionLabel?: string;

  @ApiPropertyOptional({ enum: DIETARY_FLAGS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  dietaryFlags?: string[];

  @ApiPropertyOptional({ enum: FSA_14_ALLERGENS, isArray: true, description: 'Must be from FSA 14 allergens list' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  allergens?: string[];

  @ApiPropertyOptional({ minimum: 0, maximum: 3, default: 0, description: 'Defaults to 0 on create' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3)
  spiceLevel?: number;

  @ApiPropertyOptional({ default: false, description: 'Defaults to false on create' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  @IsBoolean()
  isHalal?: boolean;

  @ApiProperty({ minimum: 15, description: 'Preparation time in minutes (>=15)' })
  @Type(() => Number)
  @IsInt()
  @Min(15)
  prepTimeMinutes!: number;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_IMAGES_PER_ITEM })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_IMAGES_PER_ITEM)
  @IsUrl({ require_tld: false }, { each: true })
  images?: string[];

  @ApiPropertyOptional({ default: 0, description: 'Display order within the menu. Defaults to 0.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({ description: 'Optional servings per portion' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  servingsCount?: number;
}
