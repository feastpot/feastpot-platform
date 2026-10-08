import { requireMatchingWalletIntent } from '../lib/wallet-payment-validation';

describe('Wallet payment amount and capture validation', () => {
  const intent = {
    amount: 4_200,
    currency: 'gbp',
    capture_method: 'manual',
    status: 'requires_payment_method',
  };

  it('accepts the exact manual-capture order amount', () => {
    expect(() => requireMatchingWalletIntent(intent, 4_200, 'manual')).not.toThrow();
  });

  it('accepts automatic-capture catering payment intents', () => {
    expect(() =>
      requireMatchingWalletIntent({ ...intent, capture_method: 'automatic' }, 4_200, 'automatic'),
    ).not.toThrow();
  });

  it.each([
    { amount: 4_199 },
    { amount: 4_201 },
    { currency: 'eur' },
    { capture_method: 'automatic' },
    { status: 'canceled' },
  ])('rejects mismatched or cancelled intents: %j', (override) => {
    expect(() => requireMatchingWalletIntent({ ...intent, ...override }, 4_200, 'manual')).toThrow(
      'Please review the amount',
    );
  });

  it.each([0, -1, 4_200.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid expected amounts: %s',
    (amount) => {
      expect(() => requireMatchingWalletIntent(intent, amount, 'manual')).toThrow();
    },
  );

  it('rejects a missing intent', () => {
    expect(() => requireMatchingWalletIntent(undefined, 4_200, 'manual')).toThrow();
  });

  it.each(['succeeded', 'requires_capture'])(
    'allows %s intents to reach confirmation-only recovery',
    (status) => {
      expect(() =>
        requireMatchingWalletIntent({ ...intent, status }, 4_200, 'manual'),
      ).not.toThrow();
    },
  );
});
