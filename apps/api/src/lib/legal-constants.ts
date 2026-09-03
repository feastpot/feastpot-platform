import { COMMISSION_RATES } from '@feastpot/config/commission-rates';

export const LEGAL = {
  ICO_NUMBER: 'ZC146267',
  ICO_VERIFY_URL: 'https://ico.org.uk/ESDWebPages/Entry/ZC146267',
  COMPANY_NAME: 'Feastpot Ltd',
  SUPPORT_EMAIL: 'info@feastpot.co.uk',
  PLATFORM_COMMISSION_PCT: COMMISSION_RATES.marketplaceFirst.percent,
  VENDOR_PAYOUT_PCT: 100 - COMMISSION_RATES.marketplaceFirst.percent,
} as const;
