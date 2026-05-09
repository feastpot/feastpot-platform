import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class HoldPayoutDto {
  @ApiProperty({ description: 'Why the payout is being held (audited)' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  holdReason!: string;
}
