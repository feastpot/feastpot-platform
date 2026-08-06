import { FhrsStatus, VerificationState } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertVerificationDto {
  @IsString()
  registrationNumber: string;

  @IsString()
  registrationAuthority: string;

  @IsDateString()
  registrationConfirmedAt: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  fhrsRating?: number | null;

  @IsOptional()
  @IsDateString()
  fhrsRatingCheckedAt?: string | null;

  @IsEnum(FhrsStatus)
  fhrsInspectionStatus: FhrsStatus;

  @IsOptional()
  @IsString()
  insuranceProvider?: string | null;

  @IsOptional()
  @IsDateString()
  insuranceValidUntil?: string | null;

  @IsBoolean()
  allergenTrainingHeld: boolean;

  @IsOptional()
  @IsDateString()
  allergenTrainingUntil?: string | null;

  @IsOptional()
  @IsDateString()
  idVerifiedAt?: string | null;

  @IsEnum(VerificationState)
  overallState: VerificationState;
}
