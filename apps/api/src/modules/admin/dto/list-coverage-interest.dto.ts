import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListCoverageInterestDto {
  @ApiPropertyOptional({ description: 'Filter by postcode prefix (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  postcode?: string;

  @ApiPropertyOptional({ description: "Filter by notified flag ('true' | 'false')" })
  @IsOptional()
  @IsBooleanString()
  notified?: string;

  @ApiPropertyOptional({ description: 'Cursor (row id) from the previous page' })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
