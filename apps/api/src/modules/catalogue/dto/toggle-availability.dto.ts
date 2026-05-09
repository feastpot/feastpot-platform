import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ToggleAvailabilityDto {
  @ApiProperty()
  @IsBoolean()
  isAvailable!: boolean;
}
