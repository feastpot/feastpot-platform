import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export const STRIPE_CLIENT = Symbol('STRIPE_CLIENT');

export interface CreatePaymentIntentParams {
  amountPence: number;
  orderId: string;
  customerId: string;
  vendorId: string;
}

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  constructor(@Inject(STRIPE_CLIENT) private readonly stripe: Stripe) {}

  retrieve(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.retrieve(paymentIntentId);
  }

  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create({
      amount: params.amountPence,
      currency: 'gbp',
      capture_method: 'manual',
      metadata: { orderId: params.orderId, customerId: params.customerId, vendorId: params.vendorId },
    });
  }

  capture(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.capture(paymentIntentId);
  }

  cancel(paymentIntentId: string, reason?: Stripe.PaymentIntentCancelParams.CancellationReason) {
    return this.stripe.paymentIntents.cancel(paymentIntentId, reason ? { cancellation_reason: reason } : undefined);
  }

  refund(paymentIntentId: string): Promise<Stripe.Refund> {
    return this.stripe.refunds.create({ payment_intent: paymentIntentId });
  }
}

export const stripeClientFactory = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (cfg: ConfigService): Stripe => {
    const key = cfg.get<string>('STRIPE_SECRET_KEY') ?? 'sk_test_placeholder';
    if (!cfg.get<string>('STRIPE_SECRET_KEY')) {
      new Logger('StripeService').warn(
        'STRIPE_SECRET_KEY not set — Stripe calls will fail until configured.',
      );
    }
    return new Stripe(key, { apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion });
  },
};
