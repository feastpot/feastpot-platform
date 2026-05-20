import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @ApiPropertyOptional({ description: 'Required when status is cancelled' })
  @ValidateIf((o: UpdateOrderStatusDto) => o.status === OrderStatus.cancelled)
  @IsString()
  @MaxLength(500)
  cancellationReason?: string;

  @ApiPropertyOptional({ description: 'Required when status is rejected' })
  @ValidateIf((o: UpdateOrderStatusDto) => o.status === OrderStatus.rejected)
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;

  /**
   * Required when status is `needs_clarification`. The question is shown to
   * the customer so they can reply (and the vendor can then accept or reject).
   */
  @ApiPropertyOptional({ description: 'Required when status is needs_clarification' })
  @ValidateIf((o: UpdateOrderStatusDto) => o.status === OrderStatus.needs_clarification)
  @IsString()
  @MaxLength(500)
  clarificationNote?: string;

  /**
   * Vendor-supplied ETA (minutes from now) when transitioning to dispatched.
   * Bound to a generous 4-hour ceiling - anything longer is almost certainly
   * a typo.
   */
  @ApiPropertyOptional({ description: 'ETA minutes from now (only meaningful on dispatched)', minimum: 1, maximum: 240 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(240)
  etaMinutes?: number;
}
