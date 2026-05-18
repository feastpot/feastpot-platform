import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class ValidateDiscountCodeDto {
  @ApiProperty({ description: 'The promo code the customer entered.' })
  @IsString()
  @MaxLength(30)
  code!: string;

  @ApiProperty({ description: 'Vendor the basket is being placed against (used for vendor-scoped codes).' })
  @IsUUID()
  vendorId!: string;

  @ApiProperty({ minimum: 1, description: 'Subtotal in pence - used for min-order validation + percentage maths.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  subtotalPence!: number;
}
