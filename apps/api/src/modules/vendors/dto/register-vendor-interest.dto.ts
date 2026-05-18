import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Public vendor application form payload. Field shape mirrors the
 * become-a-vendor form on the vendor portal so the frontend doesn't
 * have to remap. Strings are validated for length but not normalised
 * server-side - the service trims & lowercases email before persisting.
 */
export class RegisterVendorInterestDto {
  @ApiProperty({ minLength: 2, maxLength: 255 })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName!: string;

  @ApiProperty({ minLength: 2, maxLength: 255 })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  kitchenName!: string;

  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ minLength: 7, maxLength: 40 })
  @IsString()
  @MinLength(7)
  @MaxLength(40)
  phone!: string;

  @ApiProperty({ minLength: 2, maxLength: 16 })
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  postcode!: string;

  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MaxLength(64)
  cuisineType!: string;

  @ApiProperty({ enum: ['home', 'commercial', 'pop-up', 'other'] })
  @IsIn(['home', 'commercial', 'pop-up', 'other'])
  kitchenType!: 'home' | 'commercial' | 'pop-up' | 'other';

  @ApiProperty()
  @IsBoolean()
  hasFoodHygieneRegistration!: boolean;

  @ApiProperty({ minLength: 10, maxLength: 4000 })
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  foodStory!: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagram?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}
