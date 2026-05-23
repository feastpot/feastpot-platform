import { ApiPropertyOptional } from '@nestjs/swagger';
import { EnquiryStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListEventEnquiriesDto {
  @ApiPropertyOptional({ enum: EnquiryStatus })
  @IsOptional()
  @IsEnum(EnquiryStatus)
  status?: EnquiryStatus;

  // ---- admin-only filters (ignored for customer/vendor scopes) ----------

  @ApiPropertyOptional({ description: 'Free-text search on customer email / name / postcode (ILIKE contains). Admin only.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Event date (inclusive) lower bound — ISO8601' })
  @IsOptional()
  @IsDateString()
  eventFrom?: string;

  @ApiPropertyOptional({ description: 'Event date (inclusive) upper bound — ISO8601' })
  @IsOptional()
  @IsDateString()
  eventTo?: string;

  @ApiPropertyOptional({ description: 'Created at (inclusive) lower bound — ISO8601' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'Created at (inclusive) upper bound — ISO8601' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ description: 'Budget lower bound (pence). Filters enquiries whose budgetPence >= this.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetMin?: number;

  @ApiPropertyOptional({ description: 'Budget upper bound (pence). Filters enquiries whose budgetPence <= this.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetMax?: number;

  // ---- pagination (admin/support only — others get the legacy array) ----

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;

  @ApiPropertyOptional({ description: 'Opaque base64url keyset cursor returned in the previous response' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(/^[A-Za-z0-9_\-=]+$/)
  cursor?: string;
}
