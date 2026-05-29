import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Customer "tell me when you launch here" payload. The customer arrived on
 * the waitlist page after entering an uncovered postcode; we want their
 * email so ops can email them the moment a vendor goes live in their area.
 *
 * Schema intentionally tiny — extra fields can be added once we know what
 * the ops team actually needs to action.
 */
export class CoverageInterestDto {
  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ minLength: 2, maxLength: 16 })
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  postcode!: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;
}
