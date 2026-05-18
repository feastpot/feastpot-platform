import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * UK postcode format. Mirrors the FSA's accepted pattern, allowing the
 * single optional space (`AB1 2CD` and `AB12CD` both match). The spec we
 * inherited used `s?` which is a typo - we keep `\s?` so the regex actually
 * accepts the optional whitespace it intends to.
 */
export const UK_POSTCODE_REGEX = /^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$/i;

export class CreateAddressDto {
  @ApiPropertyOptional({ maxLength: 60, description: 'Friendly label, e.g. "Home" or "Office".' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @ApiProperty({ minLength: 3, maxLength: 255 })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  line1!: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  line2?: string;

  @ApiProperty({ maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string;

  @ApiProperty({ description: 'UK postcode. Whitespace is optional.', example: 'SE15 4ST' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(UK_POSTCODE_REGEX, { message: 'postcode must be a valid UK postcode' })
  postcode!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
