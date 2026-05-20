import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { CreateVendorDto } from './create-vendor.dto';

/**
 * Business-profile editor (T005). Fields are additive and all optional so a
 * vendor can save a single field at a time without resending the whole
 * profile. `slug` must be unique across vendors and the service rejects a
 * value already in use by another vendor (case-insensitive).
 *
 * `socialLinks` is intentionally typed as a free Record because the editor
 * is still settling on which networks to surface. We validate each value is
 * a URL at the service level; here we only require the wrapper is an object.
 */
export class UpdateVendorDto extends PartialType(CreateVendorDto) {
  @ApiPropertyOptional({ description: 'Minimum order in pence; persisted on the vendor delivery config' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrderPence?: number;

  @ApiPropertyOptional({ minLength: 3, maxLength: 64, description: 'URL slug (a-z, 0-9, -)' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, digits and single hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({ description: 'Public logo image URL (use POST /vendors/:id/images?kind=logo to upload).' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'Public cover image URL (use POST /vendors/:id/images?kind=cover to upload).' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  coverImageUrl?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 12, description: 'Short specialities surfaced as pills.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  specialities?: string[];

  @ApiPropertyOptional({ maxLength: 4000, description: 'Long-form vendor story / bio.' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  vendorStory?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 6, description: 'Featured dish names highlighted on the storefront.' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  featuredDishes?: string[];

  @ApiPropertyOptional({
    description: 'Social handles keyed by network (instagram/tiktok/facebook/youtube/website). Values must be URLs.',
    example: { instagram: 'https://instagram.com/maman', website: 'https://maman.example' },
  })
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, string>;
}
