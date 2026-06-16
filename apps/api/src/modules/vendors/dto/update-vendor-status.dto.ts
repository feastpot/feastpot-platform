import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VendorStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateVendorStatusDto {
  @ApiProperty({ enum: VendorStatus })
  @IsEnum(VendorStatus)
  status!: VendorStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  reasonCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description: 'Optional weekly order cap (informational metadata only - no schema column)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orderCapWeekly?: number;
}
