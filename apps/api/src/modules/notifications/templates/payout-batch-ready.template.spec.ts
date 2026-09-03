import { TEMPLATES } from '.';

describe('payout_batch_ready template', () => {
  const template = TEMPLATES.payout_batch_ready!;

  it('renders only rates and blended figures from the canonical statement', () => {
    const html = template.render({
      grossPence: 12_000,
      commissionPence: 520,
      refundsPence: 0,
      chargebacksPence: 0,
      serviceFeesPence: 0,
      adjustmentsPence: 0,
      amountPence: 11_480,
      referralUrl: 'https://feastpot.co.uk/v/test-kitchen',
      statement: {
        appliedCommissionRates: [
          { source: 'MARKETPLACE_FIRST', effectiveCommissionRatePercent: '8.00' },
          { source: 'MARKETPLACE_REPEAT', effectiveCommissionRatePercent: '5.00' },
          { source: 'VENDOR_REFERRED', effectiveCommissionRatePercent: '0.00' },
          { source: 'CATERING', effectiveCommissionRatePercent: '10.00' },
        ],
        summary: { effectiveBlendedRatePercent: '4.33' },
      },
    });

    expect(html).toContain('marketplace rates have fallen');
    expect(html).toContain('first-order marketplace at 8.00%');
    expect(html).toContain('repeat-order marketplace at 5.00%');
    expect(html).toContain('vendor-referred at 0.00%');
    expect(html).toContain('catering at 10.00%');
    expect(html).toContain('4.33%');
    expect(html).not.toContain('attract 0% commission');
  });

  it('renders unavailable rather than a guessed rate for historical statements', () => {
    const html = template.render({
      amountPence: 0,
      statement: { summary: { effectiveBlendedRatePercent: null } },
    });

    expect(html).toContain('Effective blended rate');
    expect(html).toContain('not available');
  });
});
