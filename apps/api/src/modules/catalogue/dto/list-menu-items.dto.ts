import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

const toBool = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

export class ListMenuItemsDto {
  @ApiPropertyOptional({ description: 'Filter by category (free-text)', maxLength: 64 })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by dietary flag (e.g. vegan, gluten_free)' })
  @IsOptional()
  @IsString()
  dietaryFlag?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isHalal?: boolean;

  @ApiPropertyOptional({
    enum: ['needs_declaration', 'remediation_required'],
    description: 'Vendor-only filter for legacy dishes hidden until allergen information is added',
  })
  @IsOptional()
  @IsString()
  allergenStatus?: 'needs_declaration' | 'remediation_required';
}
