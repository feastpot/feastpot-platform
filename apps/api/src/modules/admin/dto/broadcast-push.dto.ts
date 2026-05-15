import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export enum BroadcastAudience {
  all = 'all',
  by_city = 'by_city',
  by_cuisine = 'by_cuisine',
}

export class BroadcastPushDto {
  @ApiProperty({ enum: BroadcastAudience })
  @IsEnum(BroadcastAudience)
  audience!: BroadcastAudience;

  @ApiPropertyOptional({ description: 'Required when audience=by_city' })
  @ValidateIf((o: BroadcastPushDto) => o.audience === BroadcastAudience.by_city)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'Required when audience=by_cuisine' })
  @ValidateIf((o: BroadcastPushDto) => o.audience === BroadcastAudience.by_cuisine)
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  cuisine?: string;

  @ApiProperty({ minLength: 3, maxLength: 80 })
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  title!: string;

  @ApiProperty({ minLength: 3, maxLength: 240 })
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  body!: string;

  @ApiPropertyOptional({ description: 'Optional click-through URL' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  url?: string;
}
