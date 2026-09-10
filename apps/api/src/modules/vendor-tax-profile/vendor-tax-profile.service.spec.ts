import { TaxEntityType } from '@prisma/client';
import type Stripe from 'stripe';

import { isTaxProfileComplete, mapStripeAccount } from './vendor-tax-profile.service';

describe('vendor tax profile reconciliation', () => {
  const completeProfile = {
    entityType: TaxEntityType.SOLE_TRADER,
    legalName: 'Ada Cook',
    addressLine1: '1 Market Road',
    city: 'London',
    postcode: 'E1 1AA',
    dateOfBirth: new Date('1990-01-01T00:00:00Z'),
    companyNumber: null,
    taxIdentifier: 'QQ123456C',
    financialAccountId: 'GB:040004:****1234',
  };

  it('requires the tax identifier and reconciled financial account', () => {
    expect(isTaxProfileComplete(completeProfile)).toBe(true);
    expect(isTaxProfileComplete({ ...completeProfile, taxIdentifier: null })).toBe(false);
    expect(isTaxProfileComplete({ ...completeProfile, financialAccountId: null })).toBe(false);
  });

  it('maps only retrievable Stripe identity and masked bank fields', () => {
    const mapped = mapStripeAccount({
      business_type: 'individual',
      individual: {
        first_name: 'Ada',
        last_name: 'Cook',
        dob: { day: 2, month: 3, year: 1990 },
        address: {
          line1: '1 Market Road',
          city: 'London',
          postal_code: 'E1 1AA',
          country: 'GB',
        },
      },
      external_accounts: {
        object: 'list',
        data: [
          {
            object: 'bank_account',
            country: 'GB',
            routing_number: '040004',
            last4: '1234',
            default_for_currency: true,
            account_holder_name: 'Ada Cook',
          },
        ],
      },
    } as unknown as Stripe.Account);

    expect(mapped).toMatchObject({
      entityType: TaxEntityType.SOLE_TRADER,
      legalName: 'Ada Cook',
      addressLine1: '1 Market Road',
      dateOfBirth: new Date('1990-03-02T00:00:00Z'),
      financialAccountId: 'GB:040004:****1234',
      accountHolderName: 'Ada Cook',
    });
    expect(mapped).not.toHaveProperty('taxIdentifier');
  });
});
