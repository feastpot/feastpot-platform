import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Typical order types a cook can tick on the acquisition form. */
export const APPLICATION_ORDER_TYPES = [
  'family_pots',
  'party_trays',
  'weekly_meal_prep',
  'event_catering',
  'small_chops',
  'frozen_packs',
] as const;

/**
 * Public vendor application form payload. Field shape mirrors the
 * become-a-vendor form on the vendor portal so the frontend doesn't
 * have to remap. Strings are validated for length but not normalised
 * server-side - the service trims & lowercases email before persisting.
 */
export class RegisterVendorInterestDto {
  @ApiProperty({ minLength: 2, maxLength: 255 })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  fullName!: string;

  @ApiProperty({ minLength: 2, maxLength: 255 })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  kitchenName!: string;

  @ApiProperty({ format: 'email' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ minLength: 7, maxLength: 40 })
  @IsString()
  @MinLength(7)
  @MaxLength(40)
  phone!: string;

  @ApiProperty({ minLength: 2, maxLength: 16 })
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  postcode!: string;

  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MaxLength(64)
  cuisineType!: string;

  @ApiProperty({ enum: ['home', 'commercial', 'pop-up', 'other'] })
  @IsIn(['home', 'commercial', 'pop-up', 'other'])
  kitchenType!: 'home' | 'commercial' | 'pop-up' | 'other';

  @ApiProperty()
  @IsBoolean()
  hasFoodHygieneRegistration!: boolean;

  /** Local-authority food hygiene registration reference. Required. */
  @ApiProperty({ minLength: 2, maxLength: 64 })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  @Matches(/\S/, { message: 'hygieneRegNumber must not be blank' })
  hygieneRegNumber!: string;

  /** How far (miles) the cook is willing to deliver from their postcode. */
  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  deliveryRadiusMiles?: number;

  /** Typical order types (multi-select, optional). */
  @ApiPropertyOptional({ enum: APPLICATION_ORDER_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(APPLICATION_ORDER_TYPES.length)
  @IsIn(APPLICATION_ORDER_TYPES, { each: true })
  orderTypes?: string[];

  @ApiProperty({ minLength: 10, maxLength: 4000 })
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  foodStory!: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagram?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  /**
   * ISO-8601 timestamp captured client-side at the moment the applicant
   * ticked the "I accept the Vendor Terms" checkbox. Optional on the wire
   * for backwards compatibility with older clients; service falls back to
   * now() when omitted so we never have a missing audit row.
   */
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  acceptedTermsAt?: string;

  /**
   * Version tag of the vendor T&Cs the applicant accepted (e.g. "2026-05").
   * Legal bumps the tag when terms materially change, no schema migration
   * needed. Service falls back to the current default when omitted.
   */
  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  acceptedTermsVersion?: string;
}
