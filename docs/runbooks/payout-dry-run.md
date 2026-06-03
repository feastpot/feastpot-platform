# Runbook — Live payout dry-run (GO_LIVE_GAPS §1.5)

Run **one full payout cycle against a single test vendor in live mode** and
confirm funds settle with zero discrepancy before trusting the weekly cron
(`0 2 * * 1`, Mon 02:00 UTC) with real money.

This is a **human-operated, live-environment** procedure — it moves real money
through the live Stripe platform and can only be performed by someone with live
Stripe access and a real connected vendor account. The code path it exercises
(`PayoutsService.runWeeklyBatch` → finance approval → `StripeService.createTransfer`)
is built and unit-tested; this runbook is the manual go-live verification.

## Pre-conditions
- Live `STRIPE_SECRET_KEY` set (not a test key) and Stripe Connect enabled on the
  live platform. The webhook endpoint registered with the real signing secret in
  `STRIPE_WEBHOOK_SECRET` (see §1.1) so `transfer.created` reconciles.
- One **test vendor** onboarded on the live platform with a completed Stripe
  Express account (`payoutsEnabled = true`, `stripeAccountId` set) and a real
  (or Stripe test-mode-equivalent in a sandbox) bank account attached.
- At least one **delivered** order for that vendor inside the most recent
  completed Mon→Sun window, so the batch has something to pay. Use a small
  amount (e.g. one low-value order) to cap exposure.
- Float available on the platform Stripe balance to cover the transfer.

## Procedure
1. **Create the batch.** Trigger an out-of-cycle run from the admin Settings
   page ("run payout batch") or `POST /v1/admin/payouts/run-batch`. This enqueues
   a one-shot job (jobId `manual-payout-<ts>`) that calls `runWeeklyBatch` for the
   prior Mon→Sun window. It creates **draft** payouts only — no money moves yet.
2. **Verify the draft.** In the finance/admin payouts view, confirm the test
   vendor has a `draft` payout with the expected `amountPence`
   (`gross − commission − refunds`), `orderCount`, and period. Confirm no other
   live vendor was unexpectedly included (keep the test window clean).
3. **Approve → transfer.** Approve the draft payout. This CAS-flips it to
   `approved` then calls `createTransfer` with idempotency key
   `payout-transfer-<payoutId>` and flips it to `transferred` with the
   `stripeTransferId` on success.
4. **Reconcile.** Call `POST /v1/admin/payouts/:id/reconcile-stripe` (read-only).
   Confirm `status: "match"` and `discrepancyPence: 0` against the live Stripe
   transfer.
5. **Confirm settlement.** In the Stripe Dashboard, confirm the transfer reached
   the connected account and the connected account's payout settled to its bank
   (allow the standard UK payout delay). Confirm the finance view shows the
   payout `transferred` with zero discrepancy.

## Safety notes
- Transfers are **idempotent per payout** (key `payout-transfer-<payoutId>`): a
  timed-out-but-succeeded transfer that flips the payout to `failed` will **not**
  double-pay if it is later re-approved — Stripe returns the original transfer.
- Batch creation is idempotent per `(vendorId, periodEnd)`; re-running the batch
  in the same week skips vendors that already have a payout for that window.
- Vendors with an open dispute are created as `held`, not `draft`, and cannot be
  approved until the dispute resolves.

## Rollback / cleanup
- A draft you do not want to pay can be **held** (`POST /v1/payouts/:id/hold`).
- A transfer cannot be un-sent; reverse it in the Stripe Dashboard if needed and
  reconcile manually. Keep the test amount small so this is cheap.
