import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModerationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ModerateReviewDto {
  /** approved or rejected only — auto_approved/held are system states. */
  @ApiProperty({ enum: [ModerationStatus.approved, ModerationStatus.rejected] })
  @IsEnum(ModerationStatus)
  status!: ModerationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
