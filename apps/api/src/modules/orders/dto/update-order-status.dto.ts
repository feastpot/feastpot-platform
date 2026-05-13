import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiPropertyOptional({ description: 'Required when status is cancelled or rejected' })
  @ValidateIf((o: UpdateOrderStatusDto) => o.status === OrderStatus.cancelled)
  @IsString()
  @MaxLength(500)
  cancellationReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;

  /**
   * Vendor-supplied ETA (minutes from now) when transitioning to dispatched.
   * Bound to a generous 4-hour ceiling — anything longer is almost certainly
   * a typo.
   */
  @ApiPropertyOptional({ description: 'ETA minutes from now (only meaningful on dispatched)', minimum: 1, maximum: 240 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  etaMinutes?: number;
}
