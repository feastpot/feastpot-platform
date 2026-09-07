import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModerationStatus } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class ModerateMenuItemDto {
  /**
   * approved | rejected | held. `auto_approved` stays a system-only state set
   * at create time; admins move items between approved / rejected / held.
   */
  @ApiProperty({
    enum: [ModerationStatus.approved, ModerationStatus.rejected, ModerationStatus.held],
  })
  @IsEnum(ModerationStatus)
  status!: ModerationStatus;

  @ApiProperty({ description: 'Revision read from the moderation queue.' })
  @IsInt()
  @IsPositive()
  expectedSubmissionVersion!: number;

  @ApiProperty({
    enum: ModerationStatus,
    description: 'Moderation state read from the queue with the revision.',
  })
  @IsEnum(ModerationStatus)
  expectedStatus!: ModerationStatus;

  @ApiPropertyOptional({ description: 'Optional note shown to the vendor on rejection.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @ValidateIf((dto: ModerateMenuItemDto) => dto.status === ModerationStatus.rejected)
  @IsNotEmpty()
  reason?: string;
}
