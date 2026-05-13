import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Vendor proposes an amendment to an in-flight order. Free-text describes the
 * change ("swap rice for chips", "30 min late", etc.) plus an optional
 * price delta in pence (negative = refund customer, positive = upcharge —
 * upcharges currently rejected to avoid surprise capture).
 */
export class ProposeAmendmentDto {
  @ApiProperty({ description: 'Vendor-authored description of the proposed change' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  proposedChange!: string;

  @ApiPropertyOptional({
    description: 'Net change to the order total in pence. Negative = customer refund.',
    default: 0,
  })
  @IsOptional()
  @IsInt()
  priceDeltaPence?: number;
}

/** Customer's accept/decline of a pending amendment. */
export class RespondAmendmentDto {
  @ApiProperty()
  @IsBoolean()
  accepted!: boolean;
}
