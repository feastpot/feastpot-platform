import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeclineCateringBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
