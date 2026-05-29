import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModerationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

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

  @ApiPropertyOptional({ description: 'Optional note shown to the vendor on rejection.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
