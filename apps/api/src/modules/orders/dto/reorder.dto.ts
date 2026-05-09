import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ReorderDto {
  @ApiProperty({ description: 'New scheduled time (must be future)' })
  @IsDateString()
  scheduledFor!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deliveryAddressId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
