import * as Sentry from '@sentry/nestjs';
import type { Job } from 'bull';

import { StripeWebhookProcessor } from './stripe-webhook.processor';

jest.mock('@sentry/nestjs', () => ({
  captureMessage: jest.fn(),
  captureException: jest.fn(),
}));

function buildVendor(payoutsEnabled: boolean) {
  const vendor = {
    id: 'vendor-1',
    businessName: 'Test Kitchen',
    payoutsEnabled,
    stripePayoutsEnabled: payoutsEnabled,
  };
  const prisma: any = {
    vendor: {
      findFirst: jest.fn().mockResolvedValue(vendor),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  prisma.$transaction = jest.fn(async (fn: (tx: any) => unknown) => fn(prisma));
  const proc = new StripeWebhookProcessor(
    prisma,
    { refundRedemption: jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { proc, prisma };
}

function accountJob(payoutsEnabled: boolean, created = 1_700_000_000): Job<any> {
  return {
    data: {
      id: `evt_account_${created}`,
      type: 'account.updated',
      created,
      data: {
        id: 'acct_1',
        charges_enabled: payoutsEnabled,
        payouts_enabled: payoutsEnabled,
        requirements: {
          currently_due: payoutsEnabled ? [] : ['external_account'],
          eventually_due: ['individual.id_number'],
          past_due: payoutsEnabled ? [] : ['external_account'],
          pending_verification: [],
          disabled_reason: payoutsEnabled ? null : 'requirements.past_due',
        },
      },
    },
  } as Job<any>;
}

describe('StripeWebhookProcessor account.updated', () => {
  it('stores capability loss, requirements, audit, and raises an alert', async () => {
    const { proc, prisma } = buildVendor(true);
    const sentry = Sentry.captureMessage as jest.Mock;
    sentry.mockClear();
    await proc.onAccountUpdated(accountJob(false));
    expect(prisma.vendor.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payoutsEnabled: false,
          stripePayoutsEnabled: false,
          stripeRequirementsPastDue: ['external_account'],
          stripeRequirementsDisabledReason: 'requirements.past_due',
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(sentry).toHaveBeenCalledWith(
      expect.stringContaining('payouts capability lost'),
      'error',
    );
  });

  it('stores capability restoration without a loss alert', async () => {
    const { proc, prisma } = buildVendor(false);
    const sentry = Sentry.captureMessage as jest.Mock;
    sentry.mockClear();
    await proc.onAccountUpdated(accountJob(true));
    expect(prisma.vendor.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payoutsEnabled: true,
          stripeChargesEnabled: true,
          stripePayoutsEnabled: true,
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(sentry).not.toHaveBeenCalled();
  });

  it('ignores an out-of-order event when the database compare-and-set loses', async () => {
    const { proc, prisma } = buildVendor(true);
    prisma.vendor.updateMany.mockResolvedValue({ count: 0 });
    await proc.onAccountUpdated(accountJob(false, 1_600_000_000));
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
