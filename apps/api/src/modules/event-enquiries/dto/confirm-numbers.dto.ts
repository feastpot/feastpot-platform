import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ConfirmNumbersDto {
  @ApiProperty({ minimum: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(10)
  guestCount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  menuAdjustments?: string;
}
