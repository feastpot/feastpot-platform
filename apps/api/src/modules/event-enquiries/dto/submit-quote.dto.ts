import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SubmitQuoteDto {
  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  proposedMenu!: string;

  @ApiProperty({ minimum: 1, description: 'Per-head price in pence' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perHeadPence!: number;

  @ApiProperty({ minimum: 0, description: 'Delivery fee in pence' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  deliveryFeePence!: number;

  @ApiProperty({ minimum: 10, maximum: 100, description: 'Required deposit % of total' })
  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(100)
  minDepositPct!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  terms?: string;

  @ApiProperty({ description: 'ISO datetime - when this quote expires' })
  @IsDateString()
  expiresAt!: string;
}
