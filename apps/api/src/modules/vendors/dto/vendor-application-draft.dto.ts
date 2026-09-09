import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const APPLICATION_CUISINES = [
  'Nigerian',
  'Ghanaian',
  'Jamaican',
  'Trinidadian',
  'Guyanese',
  'Congolese',
  'Somali',
  'Ethiopian',
  'Eritrean',
  'Kenyan',
  'Ugandan',
  'South African',
  'West African',
  'East African',
  'Caribbean',
  'Other',
] as const;

export const APPLICATION_OCCASIONS = [
  'sunday-family-meal',
  'birthday-party-trays',
  'wedding-and-events',
  'office-catering',
  'weekly-meal-prep',
  'baby-shower-food',
  'small-chops',
  'frozen-soup-packs',
] as const;

export const APPLICATION_DRAFT_STEPS = [
  'phase_2_business_name',
  'phase_2_cuisines',
  'phase_2_menu',
  'phase_2_occasions',
  'phase_2_review',
] as const;

export class CreateVendorApplicationDraftDto {
  @ApiProperty({ minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ minLength: 7, maxLength: 40 })
  @IsString()
  @MinLength(7)
  @MaxLength(40)
  mobileNumber!: string;

  @ApiProperty({ minLength: 2, maxLength: 16 })
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  @Matches(/^[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}$|^GIR\s*0AA$/i, {
    message: 'postcode must be a valid UK postcode',
  })
  postcode!: string;
}

export class UpdateVendorApplicationDraftDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  kitchenName?: string;

  @ApiPropertyOptional({ enum: APPLICATION_CUISINES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsIn(APPLICATION_CUISINES, { each: true })
  cuisineTypes?: string[];

  @ApiPropertyOptional({ enum: APPLICATION_OCCASIONS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(APPLICATION_OCCASIONS.length)
  @IsIn(APPLICATION_OCCASIONS, { each: true })
  occasionSlugs?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  menuBuildFromPhoto?: boolean;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @IsIn(APPLICATION_DRAFT_STEPS)
  currentStep?: string;
}
