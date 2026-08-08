import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IssueType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDisputeDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ enum: IssueType })
  @IsEnum(IssueType)
  issueType!: IssueType;

  @ApiProperty({ minLength: 10, maxLength: 4000 })
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description!: string;

  /**
   * Flag for urgent food-safety or immediate-harm cases. When true, the
   * vendor response window is 24h instead of the standard 48h, and the
   * platform commits to the same window. Requires urgentReason.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isUrgent?: boolean;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  urgentReason?: string;
}
