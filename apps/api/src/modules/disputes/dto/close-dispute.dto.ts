import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResolutionType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CloseDisputeDto {
  @ApiProperty({ enum: ResolutionType })
  @IsEnum(ResolutionType)
  resolution!: ResolutionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resolutionNote?: string;

  /** Required when resolution=full_refund or partial_refund. */
  @ApiPropertyOptional({ minimum: 1, description: 'Refund amount in pence (required for *_refund resolutions).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  refundAmountPence?: number;
}
