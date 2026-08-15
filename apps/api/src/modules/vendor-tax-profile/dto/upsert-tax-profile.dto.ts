import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TaxEntityType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpsertTaxProfileDto {
  @ApiProperty({ enum: TaxEntityType })
  @IsEnum(TaxEntityType)
  entityType!: TaxEntityType;

  @ApiProperty({ description: 'Legal registered name of the entity or individual', maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  legalName!: string;

  @ApiPropertyOptional({
    description: 'Trading name (if different from legal name)',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  tradingName?: string;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  addressLine1!: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string;

  @ApiProperty({ maxLength: 20 })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  postcode!: string;

  @ApiPropertyOptional({ description: 'ISO 3166-1 alpha-2 country code', default: 'GB' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  country?: string;

  /**
   * Required for SOLE_TRADER entities under SI 2023/817 Schedule 1.
   * ISO 8601 date string (YYYY-MM-DD).
   */
  @ApiPropertyOptional({ description: 'Date of birth (required for sole traders)', format: 'date' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  /** Companies House registration number (required for LIMITED_COMPANY). */
  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  companyNumber?: string;

  /** Unique Taxpayer Reference (UTR) or National Insurance Number for sole traders. */
  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxIdentifier?: string;

  @ApiPropertyOptional({ default: 'GB' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  taxIdCountry?: string;

  @ApiPropertyOptional({ maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  vatNumber?: string;
}
