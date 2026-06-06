import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const CHANNELS = ['email', 'sms', 'whatsapp', 'push'] as const;

export class PreferenceUpdateDto {
  @ApiProperty({ enum: CHANNELS })
  @IsString()
  @IsIn(CHANNELS as unknown as string[])
  channel!: string;

  @ApiProperty({ description: 'Notification event name, e.g. order_confirmation' })
  @IsString()
  @MaxLength(64)
  key!: string;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

export class UpdatePreferencesDto {
  @ApiProperty({ type: [PreferenceUpdateDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PreferenceUpdateDto)
  preferences!: PreferenceUpdateDto[];
}
