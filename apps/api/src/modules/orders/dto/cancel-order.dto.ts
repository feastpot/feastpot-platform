import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelOrderDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
