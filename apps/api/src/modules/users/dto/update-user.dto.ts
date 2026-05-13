import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength } from 'class-validator';
import { UserStatus } from '@prisma/client';

/**
 * E.164 international phone format. Identical to the regex Supabase uses,
 * so a number that passes here will also be accepted by
 * `supabase.auth.admin.updateUserById({ phone })`.
 */
export const E164_PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

export class UpdateUserDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 100 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({ description: 'E.164 phone, e.g. +447700900000' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s+/g, '') : value,
  )
  @IsString()
  @Matches(E164_PHONE_REGEX, { message: 'phone must be in E.164 format (e.g. +447700900000)' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Public URL of an uploaded avatar image.' })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  avatarUrl?: string;
}

export class SyncUserDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ description: 'E.164 phone' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\s+/g, '') : value))
  @IsString()
  @Matches(E164_PHONE_REGEX, { message: 'phone must be in E.164 format' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  marketingOptIn?: boolean;

  @ApiPropertyOptional({ description: 'Referral code from /join?ref=... (FR-REF-001)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  referralCode?: string;
}

export class UpdateUserStatusDto {
  @ApiPropertyOptional({ enum: UserStatus })
  @IsEnum(UserStatus)
  status!: UserStatus;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
