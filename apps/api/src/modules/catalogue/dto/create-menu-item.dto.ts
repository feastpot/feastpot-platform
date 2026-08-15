import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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

  @ApiProperty({ description: 'Free-text category (e.g. Tray, Soup, Protein)', maxLength: 64 })
  @IsString()
  @MaxLength(64)
  category!: string;

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

  @ApiPropertyOptional({
    enum: FSA_14_ALLERGENS,
    isArray: true,
    description: 'Must be from FSA 14 allergens list',
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  allergens?: string[];

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 3,
    default: 0,
    description: 'Defaults to 0 on create',
  })
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

  // Defaults to false so vendors can save in-progress items as drafts. The
  // editor sends an explicit value; this default only matters for raw API
  // callers that omit the field. Mirrored by the Prisma column default.
  @ApiPropertyOptional({ default: false, description: 'Publish state. Defaults to false (draft).' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  @IsBoolean()
  isAvailable?: boolean = false;

  /**
   * Affirmative declaration that the dish contains NONE of the FSA 14 major
   * allergens. Storing this separately from an empty `allergens` array is
   * required because an empty array means "not declared" (unknown), not "safe".
   * A dish cannot go live unless either allergens.length > 0 OR this is true.
   */
  @ApiPropertyOptional({
    default: false,
    description: 'Affirmative declaration: dish contains none of the 14 FSA allergens.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  @IsBoolean()
  allergensFreeFrom?: boolean;

  /**
   * When true, the dish is temporarily unavailable (sold out) but remains
   * approved and ready to reinstate. Stored as a `sold_out` tag in the schema's
   * `tags` column alongside dietary flags. A sold-out dish reads as
   * isAvailable=false in the public API; this flag lets the vendor UI
   * distinguish "sold out" from "draft".
   */
  @ApiPropertyOptional({ default: false, description: 'Mark as temporarily sold out.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value === 'true' : value))
  @IsBoolean()
  soldOut?: boolean;
}
