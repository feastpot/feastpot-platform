import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class SubmitAppealDto {
  @ApiProperty({
    description: 'Grounds for the appeal. Must state the specific facts you are challenging.',
    minLength: 50,
    maxLength: 8000,
  })
  @IsString()
  @MinLength(50)
  @MaxLength(8000)
  grounds!: string;
}
