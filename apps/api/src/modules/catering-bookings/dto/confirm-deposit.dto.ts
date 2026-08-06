import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmDepositDto {
  /** The Stripe PaymentIntent id that the customer just paid. */
  @IsString()
  @IsNotEmpty()
  paymentIntentId!: string;
}
