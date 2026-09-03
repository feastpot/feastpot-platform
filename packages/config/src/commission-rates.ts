/**
 * Canonical commercial rate schedule. Every displayed commission rate and its
 * charging basis must be derived from this definition.
 */
export const COMMISSION_RATES = {
  marketplaceFirst: {
    percent: 8,
    label: 'First-order marketplace commission',
    basis: 'Food subtotal only (excluding delivery fees, service charges, and tips)',
  },
  marketplaceRepeat: {
    percent: 5,
    label: 'Repeat-order commission',
    basis: 'Food subtotal only (excluding delivery fees, service charges, and tips)',
  },
  vendorReferred: {
    percent: 0,
    label: 'Vendor-referred commission',
    basis: 'Food subtotal only',
  },
  catering: {
    percent: 10,
    label: 'Catering commission',
    basis:
      'Entire accepted quote total, including delivery, service, setup, and other quoted elements',
  },
  customerServiceFee: {
    percent: 5,
    label: 'Customer service fee',
    basis: 'Order subtotal, charged to the customer and not deducted from vendor payout',
  },
} as const;
