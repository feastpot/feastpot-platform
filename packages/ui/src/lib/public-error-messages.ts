/**
 * Deliberately static public copy. Never render a provider's message, even
 * when it arrives with a known business code.
 */
export const PUBLIC_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  BELOW_MIN_ORDER: "Your basket is below this vendor's minimum order value.",
  SLOT_UNAVAILABLE: 'This delivery slot is no longer available',
  SLOT_IN_PAST: 'Delivery slot must be in the future.',
  VENDOR_OFFLINE: 'This vendor is not currently accepting orders',
  CAPACITY_FULL: 'This vendor is fully booked for that date - please pick another date',
  DISCOUNT_INVALID: 'Invalid discount code',
  DISCOUNT_EXPIRED: 'This discount code has expired',
  DISCOUNT_EXHAUSTED: 'This code has reached its usage limit',
  DISCOUNT_VENDOR_MISMATCH: 'This discount code is not valid for this vendor',
  ORDER_NOT_CANCELLABLE: 'Your order is already being prepared - please contact the vendor',
};
