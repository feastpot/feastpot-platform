import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

import { isValidUkPostcode } from '../../../common/postcode.util';

@ValidatorConstraint({ name: 'ukPostcode', async: false })
class UkPostcodeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isValidUkPostcode(value);
  }
  defaultMessage(): string {
    return 'postcode must be a valid UK postcode';
  }
}

/**
 * At least one of businessName, instagramHandle, phone is required.
 * Enforced here (DTO level) not at the database level.
 */
export class CreateVendorRecommendationDto {
  @ApiPropertyOptional({ example: "Mama's Kitchen" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  businessName?: string;

  @ApiPropertyOptional({ example: 'mamasfood_ldn' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  instagramHandle?: string;

  @ApiPropertyOptional({ example: '+447700900000' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ example: 'SE15 4EE', description: 'Their rough area (UK postcode)' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(16)
  @ValidateIf((o: CreateVendorRecommendationDto) => Boolean(o.postcode))
  @Validate(UkPostcodeConstraint)
  postcode?: string;

  @ApiPropertyOptional({ format: 'email', description: 'Your email (so we can follow up)' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  recommendedByEmail?: string;

  /** Honeypot — must be empty. */
  @ApiPropertyOptional({ description: 'Leave blank' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;
}
