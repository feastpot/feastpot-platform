import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEventEnquiryDto {
  @ApiProperty({ example: 'wedding' })
  @IsString()
  @MaxLength(100)
  eventType!: string;

  @ApiProperty({ minimum: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(10)
  guestCount!: number;

  @ApiProperty({ description: 'ISO date - must be at least 7 days from now' })
  @IsDateString()
  eventDate!: string;

  @ApiProperty({ example: 'SW1A 1AA' })
  @IsString()
  @Matches(/^[A-Z0-9 ]{3,16}$/i, { message: 'postcode must look like a UK postcode' })
  postcode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  budgetPence?: number;

  @ApiProperty({ type: [String], example: ['Nigerian', 'Ghanaian'] })
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  cuisines!: string[];

  @ApiPropertyOptional({ type: [String], example: ['Halal', 'Vegan'] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  dietary?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
