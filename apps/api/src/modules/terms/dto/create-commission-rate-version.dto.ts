import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

/**
 * Internal DTO carried through the terms-notice flow when an admin creates
 * a new commission rate. Used to auto-generate a RATE_SCHEDULE TermsVersion
 * so that rate changes cannot bypass the legal notice engine.
 */
export class CommissionRateNoticeDto {
  @IsString()
  @IsNotEmpty()
  source!: string;

  @IsOptional()
  isFirstOrder?: boolean | null;

  @IsNumber()
  ratePercent!: number;

  @IsNumber()
  previousRatePct!: number;

  @IsDateString()
  effectiveFrom!: string;

  @IsString()
  @IsNotEmpty()
  createdBy!: string;

  @IsString()
  @IsOptional()
  note?: string;
}
