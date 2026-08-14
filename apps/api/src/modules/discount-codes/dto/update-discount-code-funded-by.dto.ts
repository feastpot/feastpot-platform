import { ApiProperty } from '@nestjs/swagger';
import { DiscountFundedBy } from '@prisma/client';
import { IsEnum } from 'class-validator';

/**
 * Payload for updating the funding source of an existing discount code.
 *
 * IMPORTANT: the server blocks this update once the code has been redeemed
 * (usedCount > 0). Changing fundedBy retroactively would alter the effective
 * payout formula for orders already calculated , instead, deactivate the old
 * code and create a replacement with the correct funding source.
 */
export class UpdateDiscountCodeFundedByDto {
  @ApiProperty({
    enum: DiscountFundedBy,
    description:
      'PLATFORM: Feastpot funds the discount; the vendor is paid in full. ' +
      'VENDOR: the vendor funds the discount; the discount comes off their payout.',
  })
  @IsEnum(DiscountFundedBy)
  fundedBy!: DiscountFundedBy;
}
