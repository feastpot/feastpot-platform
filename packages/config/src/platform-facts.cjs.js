'use strict';
// CJS runtime entry for @feastpot/config/platform-facts.
// Generated from platform-facts.ts - keep in sync when values change.
const PLATFORM_FACTS = {
  brandName: 'Feastpot',
  commission: {
    marketplaceFirst: 12.0,
    marketplaceRepeat: 10.0,
    vendorReferred: 0.0,
    basis: 'food subtotal only',
  },
  attribution: {
    vendorLinkWindowDays: 30,
    marketplaceIntroWindowDays: 90,
  },
  serviceFee: {
    percent: 5,
    capPence: 299,
  },
  feastPass: {
    monthlyPence: 399,
    annualPence: 3990,
  },
  payouts: {
    frequency: 'weekly',
    day: 'Monday',
  },
  support: {
    email: 'support@feastpot.co.uk',
    hours: 'Monday to Saturday',
    responseTime: 'within 24 hours',
    whatsapp: null,
  },
  vendorRequirements: [
    'UK business or sole trader registration',
    'Food Business Registration with your local authority',
    'FHRS rating of at least 3 out of 5 (4 recommended)',
    'Public liability insurance, minimum GBP 1 million',
    'Level 2 food safety certificate or equivalent',
    'Valid photo ID',
    'UK bank account for Stripe Connect',
  ],
  contact: {
    complianceEmail: 'compliance@feastpot.co.uk',
    appealsEmail: 'appeals@feastpot.co.uk',
  },
  appealWindowDays: 14,
  termsNoticeDays: 15,
  terminationNoticeDays: 30,
  feeChangeNoticeDays: 30,
};

function penceToPounds(pence) {
  return (pence / 100).toFixed(2);
}

exports.PLATFORM_FACTS = PLATFORM_FACTS;
exports.penceToPounds = penceToPounds;
