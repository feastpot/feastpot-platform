/**
 * Verification monetisation policy guard.
 *
 * These tests enforce the non-negotiable product principle:
 * "Verification signals are never gated by any paid tier, placement product
 *  or subscription." Any code that introduces conditional rendering based on
 * subscription or placement status will fail this suite.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { VERIFICATION_IS_NEVER_MONETISED } from '../../config/pricing';

describe('Verification monetisation policy', () => {
  it('VERIFICATION_IS_NEVER_MONETISED constant is true', () => {
    expect(VERIFICATION_IS_NEVER_MONETISED).toBe(true);
  });

  it('VerificationPanel does not gate on subscription or placement', () => {
    const src = readFileSync(
      join(__dirname, '../../../../../packages/ui/src/VerificationPanel.tsx'),
      'utf8',
    );
    const forbidden = [
      'feastPass',
      'FeastPass',
      'isMember',
      'subscriptionStatus',
      'placementTier',
      'isPremium',
      'isUpgraded',
    ];
    for (const term of forbidden) {
      expect(src).not.toContain(term);
    }
  });

  it('VendorVerificationService does not gate state transitions on subscription', () => {
    const src = readFileSync(join(__dirname, './vendor-verification.service.ts'), 'utf8');
    expect(src).not.toMatch(/feastPass|subscriptionStatus|placementTier|isPremium/);
  });
});
