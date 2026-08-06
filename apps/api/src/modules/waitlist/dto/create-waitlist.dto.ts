import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
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

const VALID_SOURCES = ['homepage', 'search-empty', 'occasion', 'catering'] as const;

export class CreateWaitlistDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'SE15 4EE', description: 'UK postcode' })
  @IsString()
  @MinLength(3)
  @MaxLength(16)
  @Validate(UkPostcodeConstraint)
  postcode!: string;

  @ApiPropertyOptional({ example: '+447700900000' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  whatsapp?: string;

  @ApiPropertyOptional({ example: 'Nigerian' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  favouriteCuisine?: string;

  @ApiProperty({ enum: VALID_SOURCES, default: 'homepage' })
  @IsIn(VALID_SOURCES)
  source!: (typeof VALID_SOURCES)[number];

  /** Honeypot - must be empty. Bots fill it; humans do not see it. */
  @ApiPropertyOptional({ description: 'Leave blank' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;
}
