import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModerationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ModerateReviewDto {
  /**
   * approved | rejected | held. auto_approved / pending remain system-only
   * states (D19 added 'held' so admins can re-flag a released review).
   */
  @ApiProperty({
    enum: [ModerationStatus.approved, ModerationStatus.rejected, ModerationStatus.held],
  })
  @IsEnum(ModerationStatus)
  status!: ModerationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
