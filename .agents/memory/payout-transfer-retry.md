---
name: Payout transfer retry architecture
description: How individual Stripe transfers are enqueued, retried, and failed after the async redesign of approvePayout().
---

# Payout transfer retry architecture

## The rule
approvePayout() enqueues a `payout-transfer` Bull job instead of calling Stripe inline.
PayoutBatchProcessor.processTransfer() calls PayoutsService.executeTransfer() with up to 5
attempts and exponential backoff (30s, 1m, 2m, 4m, 8m).

**Why:** Decouples finance approve from Stripe network; prevents a single timeout from
requiring manual reset+re-approve; lets Bull handle transient retries automatically.

## Error classification (stripe-error-classifier.ts)
- Transient -> throw, Bull retries: StripeConnectionError, StripeRateLimitError, StripeAPIError,
  generic Errors (ECONNRESET etc.)
- Terminal -> return (no throw), Bull marks job complete: StripeAuthenticationError,
  StripePermissionError, StripeIdempotencyError, StripeInvalidRequestError with codes
  account_closed, account_invalid, debit_not_authorized, no_account, etc.

## Exhausted transient retries
@OnQueueFailed in PayoutBatchProcessor calls PayoutsService.handleExhaustedPayoutTransfer()
which marks payout failed and fires the same alert set as a terminal failure.

## Alert set (alertPayoutFailure)
1. Slack (coalesced: in-process `lastPayoutSlackAlertAt`, 30-min window)
2. Finance email via `vendor_application_email_raw` (one per payout, not coalesced)
3. Vendor email via `payout_failed_terminal` template (describeStripeError for copy)

## Idempotency
- Stripe key `payout-transfer-${payoutId}` prevents double-payment on any retry
- executeTransfer() short-circuits if payout.status is already `transferred` or `failed`
- CAS rollback: if Redis down on enqueue, CAS rolls approved -> draft

**How to apply:** Any change to approvePayout() must preserve the CAS guard and the rollback.
Do NOT add Stripe calls back to approvePayout() directly. executeTransfer() is the only
place the Stripe transfer call should live.
