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

const GUEST_BANDS = ['1-10', '11-25', '26-50', '51-100', '101-200', '200+'] as const;
const BUDGET_BANDS = ['under-500', '500-1000', '1000-2500', '2500-5000', '5000+'] as const;

export class CreateCateringEnquiryDto {
  @ApiProperty({ example: 'birthday-party' })
  @IsString()
  @MaxLength(100)
  occasionType!: string;

  @ApiProperty({ enum: GUEST_BANDS })
  @IsIn(GUEST_BANDS)
  guestCountBand!: (typeof GUEST_BANDS)[number];

  @ApiPropertyOptional({ example: 'Nigerian, Caribbean' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  cuisineStyle?: string;

  @ApiProperty({ example: 'SE15 4EE' })
  @IsString()
  @MinLength(3)
  @MaxLength(16)
  @Validate(UkPostcodeConstraint)
  postcode!: string;

  @ApiPropertyOptional({ example: '2026-12-25', description: 'ISO date YYYY-MM-DD' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  eventDate?: string;

  @ApiPropertyOptional({ example: 'afternoon' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  preferredTime?: string;

  @ApiPropertyOptional({ enum: BUDGET_BANDS })
  @IsOptional()
  @IsIn(BUDGET_BANDS)
  budgetBand?: (typeof BUDGET_BANDS)[number];

  @ApiProperty({ example: 'Grace Okafor' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  contactName!: string;

  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiPropertyOptional({ example: '+447700900000' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ default: 'web' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;

  /** Honeypot — must be empty. */
  @ApiPropertyOptional({ description: 'Leave blank' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;
}
