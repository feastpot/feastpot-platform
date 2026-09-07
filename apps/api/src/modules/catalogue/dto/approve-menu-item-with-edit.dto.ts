import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsPositive, ValidateNested } from 'class-validator';

import { UpdateMenuItemDto } from './update-menu-item.dto';

/** A moderator correction made atomically with an approval decision. */
export class ApproveMenuItemWithEditDto {
  @ApiProperty({ description: 'Revision read from the moderation queue.' })
  @IsInt()
  @IsPositive()
  expectedSubmissionVersion!: number;

  @ApiProperty({ type: () => UpdateMenuItemDto })
  @ValidateNested()
  @Type(() => UpdateMenuItemDto)
  edit!: UpdateMenuItemDto;
}
