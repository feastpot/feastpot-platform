import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class IssueCreditDto {
  @ApiProperty({ minimum: 1, description: 'Credit in pence - added 1:1 to the customer loyalty balance' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountPence!: number;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class SuspendUserDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class ReinstateUserDto {
  @ApiProperty({ minLength: 10, maxLength: 500 })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}

export class OverrideOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiProperty({ maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ListAdminOrdersDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ description: 'Order ID (UUID), order number, or customer email substring' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  q?: string;

  @ApiPropertyOptional({ description: 'today | week | month — convenience preset (use createdFrom/To for custom)' })
  @IsOptional()
  @IsString()
  range?: 'today' | 'week' | 'month';

  @ApiPropertyOptional({ description: 'ISO date - include only orders created on/after this date' })
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'ISO date - include only orders created on/before this date (end of day UTC)' })
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional({
    description: 'Filter by latest payment status (any payment row on the order matches)',
    enum: ['pending', 'succeeded', 'failed', 'cancelled'],
  })
  @IsOptional()
  @IsIn(['pending', 'succeeded', 'failed', 'cancelled'])
  paymentStatus?: 'pending' | 'succeeded' | 'failed' | 'cancelled';

  @ApiPropertyOptional({
    description: 'Enrich rows with Stripe PaymentIntent status (capped to first 50)',
  })
  @IsOptional()
  withPiStatus?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Page number (1-based, default 1)', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
