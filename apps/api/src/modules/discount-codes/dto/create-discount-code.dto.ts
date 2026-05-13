import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Admin-side payload for minting a new discount code.
 *
 * `value` carries different units per `type`:
 *   - flat:       pence off (e.g. 500 = £5)
 *   - percentage: basis points (e.g. 1000 = 10%)
 */
export class CreateDiscountCodeDto {
  @ApiProperty({ description: 'A-Z, 0-9, dash and underscore. Stored case-sensitive but matched insensitively.' })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'code must contain only letters, numbers, dash or underscore' })
  code!: string;

  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  type!: DiscountType;

  @ApiProperty({ minimum: 1, description: 'flat=pence (50 → £0.50), percentage=basis points (1000 → 10%)' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  value!: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrderPence?: number;

  @ApiPropertyOptional({ minimum: 1, description: 'Cap on total redemptions across all customers. Omit for unlimited.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUses?: number;

  @ApiPropertyOptional({ description: 'ISO 8601 expiry timestamp.' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Restrict to a single vendor. Omit for platform-wide.' })
  @IsOptional()
  @IsUUID()
  vendorId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
