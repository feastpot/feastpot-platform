'use strict';
// CJS runtime entry for @feastpot/config/commission-rates.
// Generated from commission-rates.ts - keep in sync when values change.
const COMMISSION_RATES = {
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
};

exports.COMMISSION_RATES = COMMISSION_RATES;
