import Stripe from 'stripe';

/**
 * Distinguishes Stripe errors that are worth retrying (transient) from those
 * where retrying is pointless or harmful (terminal).
 *
 * Why this matters for payouts:
 *  - Transient: the network blipped or Stripe had a momentary 5xx. The vendor
 *    will be paid correctly if we retry in seconds or minutes.
 *  - Terminal: the vendor's Stripe Connect account has a structural problem
 *    (account closed, debit not authorised, etc.). Retrying wastes attempts
 *    and delays the vendor notification that tells them what to fix. We must
 *    mark the payout `failed` and notify immediately.
 *
 * Mapping rationale
 * -----------------
 * Transient types/codes:
 *   StripeConnectionError  - TCP-level timeout or connection reset; retry safe.
 *   StripeRateLimitError   - 429 from Stripe; exponential backoff resolves it.
 *   StripeAPIError         - Stripe internal 5xx; typically clears in <1 min.
 *   api_connection_error   - Stripe's own label for TCP failures.
 *   lock_timeout           - Stripe DB-level lock; retry resolves.
 *
 * Terminal codes (StripeInvalidRequestError sub-types):
 *   account_closed              - vendor's Express account was closed.
 *   account_country_not_supported - Stripe doesn't support payouts to that country.
 *   account_invalid             - account ID doesn't resolve to a valid account.
 *   debit_not_authorized        - bank rejected the debit; vendor must fix bank link.
 *   no_account                  - the destination account does not exist.
 *   routing_number_invalid      - sort code / routing number is wrong.
 *   invalid_account_number      - account number is wrong.
 *   transfers_not_allowed       - account has transfers disabled at account level.
 *
 * Authentication / permission errors are always terminal: they indicate a
 * misconfigured Stripe key, not a transient failure, and retrying won't help.
 *
 * StripeIdempotencyError means we sent conflicting parameters under the same
 * idempotency key. This is a code bug, not transient, so treat as terminal
 * and alert immediately.
 *
 * Any unrecognised error defaults to TRANSIENT so Bull retries it and we do
 * not silently drop the payout. This is the safer default: a misclassified
 * transient failure becomes terminal after max attempts anyway.
 */

export type StripeErrorClassification = 'transient' | 'terminal';

const TERMINAL_CODES = new Set([
  'account_closed',
  'account_country_not_supported',
  'account_invalid',
  'debit_not_authorized',
  'no_account',
  'routing_number_invalid',
  'invalid_account_number',
  'transfers_not_allowed',
  // These appear when the platform account itself lacks funds or capabilities,
  // which is a systemic issue that retrying won't solve.
  'insufficient_funds',
  'not_allowed',
]);

export function classifyStripeError(err: unknown): StripeErrorClassification {
  if (!(err instanceof Stripe.errors.StripeError)) {
    // Non-Stripe errors (e.g. network ECONNRESET, Prisma errors) are transient.
    return 'transient';
  }

  // These error classes are inherently terminal.
  if (
    err instanceof Stripe.errors.StripeAuthenticationError ||
    err instanceof Stripe.errors.StripePermissionError ||
    err instanceof Stripe.errors.StripeIdempotencyError
  ) {
    return 'terminal';
  }

  // Inherently transient.
  if (
    err instanceof Stripe.errors.StripeConnectionError ||
    err instanceof Stripe.errors.StripeRateLimitError ||
    err instanceof Stripe.errors.StripeAPIError
  ) {
    return 'transient';
  }

  // StripeInvalidRequestError: depends on the error code.
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    if (err.code && TERMINAL_CODES.has(err.code)) return 'terminal';
    // Unknown invalid-request codes: treat as terminal rather than retrying
    // indefinitely against a bad request.
    return 'terminal';
  }

  // Default: retry so we don't silently drop an unknown error class.
  return 'transient';
}

/**
 * Returns a plain-English explanation suitable for the vendor notification
 * email so they know what to fix, not just that it failed.
 */
export function describeStripeError(err: unknown): string {
  if (!(err instanceof Stripe.errors.StripeError)) {
    return 'An unexpected error occurred while processing your transfer. Our team has been alerted.';
  }

  const code = (err as Stripe.errors.StripeInvalidRequestError).code ?? '';

  switch (code) {
    case 'account_closed':
      return (
        'Your Stripe Connect account has been closed. ' +
        'Please contact Feastpot support so we can set up a new payout account for you.'
      );
    case 'account_invalid':
    case 'no_account':
      return (
        'Your Stripe Connect account is not fully set up or could not be found. ' +
        'Please log into your Stripe Express dashboard and complete any outstanding steps.'
      );
    case 'account_country_not_supported':
      return (
        'Your bank account is in a country that Stripe does not currently support for payouts. ' +
        'Please contact Feastpot support to discuss alternative payout arrangements.'
      );
    case 'debit_not_authorized':
      return (
        'Your bank has declined the transfer. ' +
        'Please log into your Stripe Express dashboard and check your bank account details, ' +
        'then contact your bank if the issue persists.'
      );
    case 'routing_number_invalid':
    case 'invalid_account_number':
      return (
        'Your bank account details (sort code or account number) appear to be incorrect. ' +
        'Please update them in your Stripe Express dashboard.'
      );
    case 'transfers_not_allowed':
      return (
        'Transfers are currently disabled on your Stripe account. ' +
        'Please log into your Stripe Express dashboard to review any required actions.'
      );
    case 'insufficient_funds':
      return (
        'The transfer could not be completed at this time due to a platform account issue. ' +
        'Our team has been alerted and will resolve this manually. ' +
        'No action is required on your part.'
      );
    default:
      return (
        'The transfer was declined by Stripe. ' +
        'Please log into your Stripe Express dashboard to review any required actions, ' +
        'or contact Feastpot support if you need assistance.'
      );
  }
}
