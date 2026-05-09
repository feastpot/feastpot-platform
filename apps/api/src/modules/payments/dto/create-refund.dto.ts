import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateRefundDto {
  @ApiProperty({ description: 'Order to refund (the latest succeeded Stripe PI on the order is used)' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({ minimum: 1, description: 'Refund amount in pence' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountPence!: number;

  @ApiPropertyOptional({ description: 'Reason for refund (audit log)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
