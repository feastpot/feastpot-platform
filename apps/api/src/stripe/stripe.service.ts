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

  /**
   * Create a refund. Pass `idempotencyKey` whenever the refund is triggered by
   * a deterministic business event (dispute close, webhook replay, retry) so
   * that a network/retry storm cannot double-refund the customer.
   */
  refund(paymentIntentId: string, amountPence?: number, idempotencyKey?: string): Promise<Stripe.Refund> {
    return this.stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        ...(amountPence !== undefined ? { amount: amountPence } : {}),
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
  }

  createTransfer(args: { amountPence: number; destinationAccountId: string; payoutId: string }): Promise<Stripe.Transfer> {
    return this.stripe.transfers.create({
      amount: args.amountPence,
      currency: 'gbp',
      destination: args.destinationAccountId,
      metadata: { payoutId: args.payoutId },
    });
  }

  constructEvent(payload: Buffer | string, signature: string, secret: string): Stripe.Event {
    return this.stripe.webhooks.constructEvent(payload, signature, secret);
  }

  /**
   * Create a Stripe Express connected account for a vendor. We pre-fill UK
   * country + GBP and request the standard transfers + card_payments
   * capabilities so this account can receive marketplace transfers.
   */
  createConnectAccount(args: { email: string; vendorId: string }): Promise<Stripe.Account> {
    return this.stripe.accounts.create({
      type: 'express',
      country: 'GB',
      email: args.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: 'company',
      metadata: { vendorId: args.vendorId },
    });
  }

  /**
   * Read the current state of a connected account. Used to sync
   * `payoutsEnabled`/`charges_enabled` after the vendor finishes onboarding.
   */
  retrieveAccount(accountId: string): Promise<Stripe.Account> {
    return this.stripe.accounts.retrieve(accountId);
  }

  /**
   * Generate a one-shot onboarding URL for an Express account. Stripe handles
   * KYC, tax, bank details collection. We always pass `account_onboarding` —
   * for a returning vendor whose link expired, the same call is safe.
   */
  /**
   * Retrieve a previously-created transfer so finance staff can reconcile it
   * against our local Payout row (pence-level diff).
   */
  retrieveTransfer(transferId: string): Promise<Stripe.Transfer> {
    return this.stripe.transfers.retrieve(transferId);
  }

  createOnboardingLink(args: {
    accountId: string;
    refreshUrl: string;
    returnUrl: string;
  }): Promise<Stripe.AccountLink> {
    return this.stripe.accountLinks.create({
      account: args.accountId,
      refresh_url: args.refreshUrl,
      return_url: args.returnUrl,
      type: 'account_onboarding',
    });
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
