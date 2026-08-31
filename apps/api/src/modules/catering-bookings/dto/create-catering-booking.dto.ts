import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CateringLineItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  description!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  /** Unit price in pence. Min 1p. */
  @IsInt()
  @Min(1)
  unitPence!: number;

  /** Allergen names (e.g. 'gluten', 'nuts', 'dairy'). */
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  allergens!: string[];
}

export class CreateCateringBookingDto {
  /** The CateringEnquiry this booking is created against. */
  @IsUUID()
  enquiryId!: string;

  /**
   * Optional: exact event date-time. Falls back to the enquiry's eventDate string
   * if omitted. Provide as ISO 8601 (e.g. "2026-09-14T18:00:00Z").
   */
  @IsOptional()
  @IsISO8601()
  eventDate?: string;

  /** Refined guest count once known. Falls back to enquiry guestCountBand midpoint if omitted. */
  @IsOptional()
  @IsInt()
  @Min(1)
  guestCount?: number;

  /** Event venue address for the compliance pack. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  eventAddress?: string;

  /** Preferred serving time (e.g. '18:30') for the compliance pack. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  preferredTime?: string;

  /** Line items that make up the menu and price. At least 1 required. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CateringLineItemDto)
  lineItems!: CateringLineItemDto[];

  /** Vendor-selected minimum cash deposit in pence. */
  @IsInt()
  @Min(0)
  minimumDepositPence!: number;

  /**
   * Optional: ISO 8601 datetime for quote expiry.
   * The service enforces the system maximum (min of 7 days / 48h before event)
   * and will use whichever is sooner.
   */
  @IsOptional()
  @IsISO8601()
  quoteExpiresAt?: string;
}
