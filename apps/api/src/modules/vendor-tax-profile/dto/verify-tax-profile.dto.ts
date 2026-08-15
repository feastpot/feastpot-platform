import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VerificationStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const ALLOWED_STATUSES = [
  VerificationStatus.VERIFIED,
  VerificationStatus.FAILED,
  VerificationStatus.EXEMPT,
] as const;

export class VerifyTaxProfileDto {
  @ApiProperty({
    enum: ALLOWED_STATUSES,
    description: 'New verification status (admin only; PENDING cannot be set via this endpoint)',
  })
  @IsEnum(VerificationStatus)
  @IsIn(ALLOWED_STATUSES)
  status!: (typeof ALLOWED_STATUSES)[number];

  @ApiProperty({
    description:
      'Method used to verify (e.g. "companies_house_api", "stripe_kyc", "manual_document_check")',
    maxLength: 100,
  })
  @IsString()
  @MaxLength(100)
  verificationMethod!: string;

  @ApiPropertyOptional({
    description: 'Internal note on the verification outcome',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
