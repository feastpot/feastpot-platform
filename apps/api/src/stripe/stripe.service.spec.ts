import { StripeService } from './stripe.service';

describe('StripeService Connect charge model', () => {
  function build() {
    const stripe = {
      paymentIntents: {
        create: jest.fn().mockResolvedValue({ id: 'pi_test' }),
      },
      transfers: {
        create: jest.fn().mockResolvedValue({ id: 'tr_test' }),
      },
      accounts: {
        create: jest.fn().mockResolvedValue({ id: 'acct_test' }),
      },
      accountSessions: {
        create: jest.fn().mockResolvedValue({ id: 'cas_test', client_secret: 'secret_test' }),
      },
    };

    return {
      stripe,
      service: new StripeService(stripe as never),
    };
  }

  it('creates a platform charge without destination-charge or application-fee fields', async () => {
    const { service, stripe } = build();

    await service.createPaymentIntent({
      amountPence: 4_200,
      orderId: 'order-1',
      customerId: 'customer-1',
      vendorId: 'vendor-1',
      idempotencyKey: 'order-payment-intent-order-1',
    });

    const [params] = stripe.paymentIntents.create.mock.calls[0]!;
    expect(params).toEqual({
      amount: 4_200,
      currency: 'gbp',
      capture_method: 'manual',
      metadata: {
        orderId: 'order-1',
        customerId: 'customer-1',
        vendorId: 'vendor-1',
      },
    });
    expect(params).not.toHaveProperty('application_fee_amount');
    expect(params).not.toHaveProperty('transfer_data');
    expect(params).not.toHaveProperty('on_behalf_of');
  });

  it('moves the exact locally calculated payout in a separate transfer', async () => {
    const { service, stripe } = build();

    await service.createTransfer({
      amountPence: 4_000,
      destinationAccountId: 'acct_vendor',
      payoutId: 'payout-1',
      idempotencyKey: 'payout-transfer-payout-1',
    });

    expect(stripe.transfers.create).toHaveBeenCalledWith(
      {
        amount: 4_000,
        currency: 'gbp',
        destination: 'acct_vendor',
        metadata: { payoutId: 'payout-1' },
      },
      { idempotencyKey: 'payout-transfer-payout-1' },
    );
  });

  it('creates the connected account with the vendor-selected business type', async () => {
    const { service, stripe } = build();

    await service.createConnectAccount({
      email: 'cook@example.test',
      vendorId: 'vendor-1',
      businessType: 'individual',
    });

    expect(stripe.accounts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'express',
        country: 'GB',
        email: 'cook@example.test',
        business_type: 'individual',
      }),
      { idempotencyKey: 'connect-account-vendor-1' },
    );
  });

  it('enables embedded onboarding and external account collection', async () => {
    const { service, stripe } = build();

    await service.createAccountSession('acct_vendor');

    expect(stripe.accountSessions.create).toHaveBeenCalledWith({
      account: 'acct_vendor',
      components: {
        account_onboarding: {
          enabled: true,
          features: { external_account_collection: true },
        },
      },
    });
  });
});
