import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class EditMenuImportItemDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  pricePence?: number;
  @IsOptional() @IsString() @MaxLength(64) portionLabel?: string;
}
export class AddMenuImportItemDto extends EditMenuImportItemDto {
  @IsString() @MinLength(2) @MaxLength(255) name = '';
}
export class AllergenConfirmationDto {
  @IsArray()
  @ArrayMinSize(0)
  @ArrayUnique()
  @ArrayMaxSize(14)
  @IsString({ each: true })
  allergens!: string[];
  @IsBoolean()
  allergensFreeFrom = false;
}
export class BulkAllergenConfirmationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @ArrayMaxSize(30)
  @IsUUID('4', { each: true })
  itemIds!: string[];
  @IsArray()
  @ArrayMinSize(0)
  @ArrayUnique()
  @ArrayMaxSize(14)
  @IsString({ each: true })
  allergens!: string[];
  @IsBoolean()
  allergensFreeFrom = false;
}
export class CopyAllergenConfirmationDto {
  @IsUUID() sourceItemId!: string;
}
export class ApplyMenuImportDto {
  @IsUUID() menuId!: string;
}
