import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateVendorDto {
  @ApiProperty({ minLength: 2, maxLength: 255 })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  businessName!: string;

  @ApiProperty({ type: [String], minItems: 1, description: 'Cuisine tags (maps to vendors.cuisines)' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  cuisineTypes!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
