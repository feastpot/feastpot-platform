import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class LineItemDto {
  @IsString()
  @MaxLength(255)
  description!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsInt()
  @Min(1)
  unitPence!: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];
}

export class FillCateringQuoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems!: LineItemDto[];

  /** ISO date string - overrides the event date derived from the enquiry. */
  @IsOptional()
  @IsString()
  eventDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  guestCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  eventAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  preferredTime?: string;

  @IsOptional()
  @IsString()
  quoteExpiresAt?: string;
}
