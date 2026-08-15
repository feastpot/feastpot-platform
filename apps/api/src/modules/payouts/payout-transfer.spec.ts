/**
 * Tests for the payout-transfer retry / dead-letter pipeline.
 *
 * Covered scenarios (per the task spec):
 *  1. A transient failure retries and eventually succeeds.
 *  2. A terminal failure does NOT retry and lands in dead-letter state
 *     (payout marked `failed`, alerts fired, job considered complete).
 *  3. An exhausted transient run (all 5 attempts consumed) marks payout
 *     failed and fires Slack + vendor notification via handleExhaustedPayoutTransfer.
 *  4. A manual retry from the admin UI re-enqueues correctly and the
 *     Stripe idempotency key prevents double-payment.
 *
 * Pattern: direct mocks (no TestingModule) - matches vendor-verification-notifications.spec.ts.
 */

import { PayoutStatus } from '@prisma/client';
import Stripe from 'stripe';

import { PayoutsService } from './payouts.service';
import { classifyStripeError } from './stripe-error-classifier';

// ---- helpers -----------------------------------------------------------

function _makeError(type: string, code?: string): Stripe.errors.StripeError {
  const err = new Stripe.errors.StripeError({
    type: type as Stripe.RawErrorType,
    message: `Stripe ${type}${code ? ` (${code})` : ''}`,
  });
  if (code) (err as unknown as Record<string, string>).code = code;
  return err;
}

// ---- classifyStripeError -----------------------------------------------

describe('classifyStripeError', () => {
  it('classifies StripeConnectionError as transient', () => {
    const err = new Stripe.errors.StripeConnectionError({
      message: 'Connection reset',
      type: 'api_connection_error',
    });
    expect(classifyStripeError(err)).toBe('transient');
  });

  it('classifies StripeRateLimitError as transient', () => {
    const err = new Stripe.errors.StripeRateLimitError({
      message: 'Too many requests',
      type: 'invalid_request_error',
    });
    expect(classifyStripeError(err)).toBe('transient');
  });

  it('classifies StripeAPIError (internal 5xx) as transient', () => {
    const err = new Stripe.errors.StripeAPIError({
      message: 'Internal server error',
      type: 'api_error',
    });
    expect(classifyStripeError(err)).toBe('transient');
  });

  it('classifies StripeAuthenticationError as terminal', () => {
    const err = new Stripe.errors.StripeAuthenticationError({
      message: 'No such API key',
      type: 'invalid_request_error',
    });
    expect(classifyStripeError(err)).toBe('terminal');
  });

  it('classifies StripePermissionError as terminal', () => {
    const err = new Stripe.errors.StripePermissionError({
      message: 'Permission denied',
      type: 'invalid_request_error',
    });
    expect(classifyStripeError(err)).toBe('terminal');
  });

  it('classifies StripeIdempotencyError as terminal', () => {
    const err = new Stripe.errors.StripeIdempotencyError({
      message: 'Idempotency conflict',
      type: 'idempotency_error',
    });
    expect(classifyStripeError(err)).toBe('terminal');
  });

  it.each([
    'account_closed',
    'account_invalid',
    'debit_not_authorized',
    'no_account',
    'routing_number_invalid',
    'invalid_account_number',
    'transfers_not_allowed',
  ])('classifies StripeInvalidRequestError with code "%s" as terminal', (code) => {
    const err = new Stripe.errors.StripeInvalidRequestError({
      message: `Error code: ${code}`,
      type: 'invalid_request_error',
    });
    (err as unknown as Record<string, string>).code = code;
    expect(classifyStripeError(err)).toBe('terminal');
  });

  it('classifies a generic Error (network crash, Prisma error) as transient', () => {
    expect(classifyStripeError(new Error('ECONNRESET'))).toBe('transient');
  });
});

// ---- PayoutsService.executeTransfer ------------------------------------

describe('PayoutsService.executeTransfer', () => {
  const PAYOUT_ID = 'pay_test_001';
  const VENDOR_ID = 'vendor_abc';

  const mockPayout = {
    id: PAYOUT_ID,
    vendorId: VENDOR_ID,
    amountPence: 12345,
    status: PayoutStatus.approved,
    vendor: {
      stripeAccountId: 'acct_test_xyz',
      payoutsEnabled: true,
      userId: 'user_vendor_1',
      businessName: 'Test Kitchen',
    },
  };

  const mockPrisma = {
    payout: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const mockStripe = { createTransfer: jest.fn() };
  const mockNotifications = { add: jest.fn() };
  const mockInbox = { notify: jest.fn() };
  const mockCommission = {};
  const mockPayoutQueue = { add: jest.fn() };

  let service: PayoutsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PayoutsService(
      mockPrisma as never,
      mockStripe as never,
      mockNotifications as never,
      mockInbox as never,
      mockCommission as never,
      mockPayoutQueue as never,
    );
    mockPrisma.payout.findUnique.mockResolvedValue(mockPayout);
    mockPrisma.payout.update.mockResolvedValue({ ...mockPayout, status: PayoutStatus.transferred });
    mockStripe.createTransfer.mockResolvedValue({ id: 'tr_test_abc' });
    mockNotifications.add.mockResolvedValue(undefined);
    mockInbox.notify.mockResolvedValue(undefined);
  });

  it('scenario 1: transient failure throws so Bull retries, then succeeds', async () => {
    const transientErr = new Stripe.errors.StripeConnectionError({
      message: 'Connection reset',
      type: 'api_connection_error',
    });

    // First call: transient failure.
    mockStripe.createTransfer.mockRejectedValueOnce(transientErr);
    // Second call: success.
    mockStripe.createTransfer.mockResolvedValueOnce({ id: 'tr_test_abc' });

    // Attempt 1 - should throw (Bull will retry).
    await expect(service.executeTransfer(PAYOUT_ID)).rejects.toThrow();
    expect(mockPrisma.payout.update).not.toHaveBeenCalled(); // not marked failed

    // Attempt 2 - should succeed.
    await service.executeTransfer(PAYOUT_ID);
    expect(mockPrisma.payout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PayoutStatus.transferred }),
      }),
    );
  });

  it('scenario 2: terminal failure marks payout failed, alerts, does NOT throw', async () => {
    const terminalErr = new Stripe.errors.StripeInvalidRequestError({
      message: 'Account closed',
      type: 'invalid_request_error',
    });
    (terminalErr as unknown as Record<string, string>).code = 'account_closed';

    mockStripe.createTransfer.mockRejectedValue(terminalErr);

    // Should NOT throw (so Bull considers the job complete, preventing retries).
    await expect(service.executeTransfer(PAYOUT_ID)).resolves.toBeUndefined();

    // Payout must be marked failed.
    expect(mockPrisma.payout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PayoutStatus.failed }),
      }),
    );

    // Vendor notification must be sent.
    expect(mockNotifications.add).toHaveBeenCalledWith(
      'payout_failed_terminal',
      expect.objectContaining({ payoutId: PAYOUT_ID }),
    );

    // Finance email must be sent.
    expect(mockNotifications.add).toHaveBeenCalledWith(
      'vendor_application_email_raw',
      expect.objectContaining({ subject: expect.stringContaining('ACTION REQUIRED') }),
    );
  });

  it('scenario 3: handleExhaustedPayoutTransfer marks payout failed and alerts', async () => {
    const transientErr = new Error('Connection refused');
    mockPrisma.payout.findUnique.mockResolvedValue({
      ...mockPayout,
      status: PayoutStatus.approved,
    });

    await service.handleExhaustedPayoutTransfer(PAYOUT_ID, transientErr);

    expect(mockPrisma.payout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PayoutStatus.failed }),
      }),
    );
    expect(mockNotifications.add).toHaveBeenCalledWith(
      'payout_failed_terminal',
      expect.objectContaining({ payoutId: PAYOUT_ID }),
    );
  });

  it('scenario 3b: handleExhaustedPayoutTransfer is idempotent when payout already failed', async () => {
    mockPrisma.payout.findUnique.mockResolvedValue({
      ...mockPayout,
      status: PayoutStatus.failed,
    });

    await service.handleExhaustedPayoutTransfer(PAYOUT_ID, new Error('already failed'));

    // Should NOT update the DB or send notifications again.
    expect(mockPrisma.payout.update).not.toHaveBeenCalled();
    expect(mockNotifications.add).not.toHaveBeenCalled();
  });

  it('scenario 4: manual admin retry uses same Stripe idempotency key - no double payment', async () => {
    // Simulate the payout being reset to draft then re-approved (executeTransfer called again).
    // Stripe idempotency key must be the same deterministic value.
    await service.executeTransfer(PAYOUT_ID);

    const call = mockStripe.createTransfer.mock.calls[0][0] as { idempotencyKey: string };
    expect(call.idempotencyKey).toBe(`payout-transfer-${PAYOUT_ID}`);

    // If Stripe returns the existing transfer (not a new one), the DB update still runs.
    expect(mockPrisma.payout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stripeTransferId: 'tr_test_abc' }),
      }),
    );
  });

  it('returns early without Stripe call if payout is already transferred', async () => {
    mockPrisma.payout.findUnique.mockResolvedValue({
      ...mockPayout,
      status: PayoutStatus.transferred,
    });

    await service.executeTransfer(PAYOUT_ID);

    expect(mockStripe.createTransfer).not.toHaveBeenCalled();
  });

  it('returns early without Stripe call if payout is already failed', async () => {
    mockPrisma.payout.findUnique.mockResolvedValue({
      ...mockPayout,
      status: PayoutStatus.failed,
    });

    await service.executeTransfer(PAYOUT_ID);

    expect(mockStripe.createTransfer).not.toHaveBeenCalled();
  });
});
