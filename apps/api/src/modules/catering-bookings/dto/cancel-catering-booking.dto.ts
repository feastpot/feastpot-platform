import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelCateringBookingDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason?: string;
}
