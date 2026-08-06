import { IsNotEmpty, IsString } from 'class-validator';

export class ConfirmBalanceDto {
  /** The Stripe PaymentIntent id that the customer just paid. */
  @IsString()
  @IsNotEmpty()
  paymentIntentId!: string;
}
