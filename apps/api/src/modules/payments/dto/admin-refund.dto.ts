import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** Fixed reason set so refund analytics/audit are queryable, not free text. */
export enum RefundReason {
  customer_complaint = 'customer_complaint',
  order_not_delivered = 'order_not_delivered',
  food_safety = 'food_safety',
  goodwill = 'goodwill',
  other = 'other',
}

export class AdminRefundDto {
  @ApiPropertyOptional({
    minimum: 1,
    description: 'Refund amount in pence. Omit to refund the full remaining refundable amount.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountPence?: number;

  @ApiProperty({ enum: RefundReason, description: 'Structured refund reason (audited)' })
  @IsEnum(RefundReason)
  reason!: RefundReason;

  @ApiPropertyOptional({
    description: 'Free-text note for the audit trail. Required when reason=other.',
  })
  @ValidateIf((o: AdminRefundDto) => o.reason === RefundReason.other || o.note !== undefined)
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({
    description:
      'Client-supplied idempotency token (UUID). Required: repeated requests with the same ' +
      'requestId produce exactly one Stripe refund and one ledger entry, and the transfer ' +
      'reversal for already-paid-out vendors is only safe with a deterministic key.',
  })
  @IsUUID()
  requestId!: string;
}
