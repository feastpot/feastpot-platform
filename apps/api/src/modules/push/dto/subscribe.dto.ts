import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/**
 * The `PushSubscription.toJSON()` shape that the browser produces. We accept
 * it as-is (rather than asking the client to remap to our DB columns) so the
 * frontend just forwards the object verbatim.
 */
export class PushSubscriptionKeysDto {
  @ApiProperty()
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  p256dh!: string;

  @ApiProperty()
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  auth!: string;
}

export class SubscribePushDto {
  @ApiProperty()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  endpoint!: string;

  // `@IsObject` alone wouldn't validate nested fields - a missing/blank
  // `p256dh` would slip through global ValidationPipe and explode at Prisma.
  // `@ValidateNested` + `@Type` plumbs class-validator into the nested DTO.
  @ApiProperty({ type: PushSubscriptionKeysDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PushSubscriptionKeysDto)
  keys!: PushSubscriptionKeysDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  userAgent?: string;
}

export class UnsubscribePushQueryDto {
  @ApiProperty()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  endpoint!: string;
}
