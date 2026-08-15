import { PLATFORM_FACTS } from '@feastpot/config/platform-facts';

export const LEGAL = {
  ICO_NUMBER: 'ZC146267',
  ICO_VERIFY_URL: 'https://ico.org.uk/ESDWebPages/Entry/ZC146267',
  /** Sourced from PLATFORM_FACTS to ensure a single change propagates everywhere. */
  PLATFORM_COMMISSION_PCT: PLATFORM_FACTS.commission.marketplaceFirst,
  VENDOR_PAYOUT_PCT: 100 - PLATFORM_FACTS.commission.marketplaceFirst,
  /** Full legal entity name - includes the company suffix, unlike PLATFORM_FACTS.brandName. */
  COMPANY_NAME: 'Feastpot Ltd',
  REGISTERED_IN: 'England and Wales',
  /** Sourced from PLATFORM_FACTS - change support.email there to update everywhere. */
  SUPPORT_EMAIL: PLATFORM_FACTS.support.email,
  PRIVACY_EMAIL: 'privacy@feastpot.co.uk',
  LAST_UPDATED: 'May 2026',
} as const;
