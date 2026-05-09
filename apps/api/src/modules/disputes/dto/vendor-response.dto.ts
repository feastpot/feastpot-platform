import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class VendorResponseDto {
  @ApiProperty({ minLength: 5, maxLength: 4000 })
  @IsString()
  @MinLength(5)
  @MaxLength(4000)
  response!: string;
}
