export type WalletCaptureMethod = 'manual' | 'automatic';

export function requireMatchingWalletIntent(
  intent: { amount: number; currency: string; capture_method: string; status: string } | undefined,
  amountPence: number,
  captureMethod: WalletCaptureMethod,
): void {
  if (
    !Number.isSafeInteger(amountPence) ||
    amountPence <= 0 ||
    !intent ||
    intent.amount !== amountPence ||
    intent.currency !== 'gbp' ||
    intent.capture_method !== captureMethod ||
    intent.status === 'canceled'
  ) {
    throw new Error('The payment details have changed. Please review the amount and try again.');
  }
}
