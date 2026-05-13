import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleDiscountCodeDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}
