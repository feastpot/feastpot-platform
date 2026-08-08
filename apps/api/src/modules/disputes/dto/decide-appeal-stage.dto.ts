import { ApiProperty } from '@nestjs/swagger';
import { AppealOutcome } from '@prisma/client';
import { IsEnum, IsString, MinLength, MaxLength } from 'class-validator';

export class DecideAppealStageDto {
  @ApiProperty({ enum: AppealOutcome })
  @IsEnum(AppealOutcome)
  outcome!: AppealOutcome;

  @ApiProperty({
    description: 'Written reasons for the decision. Minimum 50 characters.',
    minLength: 50,
    maxLength: 8000,
  })
  @IsString()
  @MinLength(50)
  @MaxLength(8000)
  reasons!: string;
}
