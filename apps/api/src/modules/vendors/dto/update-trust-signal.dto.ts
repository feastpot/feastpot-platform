import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TrustSignalStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Admin verification action for a vendor trust signal. Only the two
 * reviewer-set statuses are accepted; `not_provided` / `submitted` are
 * vendor-side states and can never be set through this endpoint.
 */
export class UpdateTrustSignalDto {
  @ApiProperty({ enum: [TrustSignalStatus.verified, TrustSignalStatus.expired] })
  @IsIn([TrustSignalStatus.verified, TrustSignalStatus.expired])
  status!: typeof TrustSignalStatus.verified | typeof TrustSignalStatus.expired;

  @ApiPropertyOptional({ description: 'Optional evidence reference to record alongside the review' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  evidenceReference?: string;
}
