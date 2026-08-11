import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VendorComplianceStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateVendorComplianceDto {
  @ApiProperty({
    enum: VendorComplianceStatus,
    description:
      'RATED: vendor has an FSA rating >= 3 and may appear in search / accept orders. ' +
      'REGISTERED_AWAITING_INSPECTION: registered but not yet inspected; onboarding allowed, not live. ' +
      'NOT_ELIGIBLE: unregistered; cannot proceed past application stage.',
  })
  @IsEnum(VendorComplianceStatus)
  complianceStatus!: VendorComplianceStatus;

  @ApiPropertyOptional({
    description: 'FSA Food Hygiene Rating 0-5. Required (with value >= 3) for RATED status.',
    minimum: 0,
    maximum: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  fsaHygieneRating?: number;

  @ApiPropertyOptional({ description: 'ISO 8601 date the FSA rating was confirmed.' })
  @IsOptional()
  @IsDateString()
  fsaRatingDate?: string;

  @ApiPropertyOptional({ description: 'Local authority food business registration number.' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  fsaRegistrationNumber?: string;

  @ApiPropertyOptional({ description: 'FHRS establishment ID (used for future API lookups).' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  fhrsId?: string;

  @ApiPropertyOptional({
    description: 'ISO 8601 datetime of the most recent manual or automated FSA check.',
  })
  @IsOptional()
  @IsDateString()
  @Transform(({ value }: { value: unknown }) => value ?? undefined)
  fsaLastChecked?: string;
}
