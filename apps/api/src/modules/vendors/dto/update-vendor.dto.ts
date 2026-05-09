import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

import { CreateVendorDto } from './create-vendor.dto';

export class UpdateVendorDto extends PartialType(CreateVendorDto) {
  @ApiPropertyOptional({ description: 'Minimum order in pence; persisted on the vendor delivery config' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrderPence?: number;
}
