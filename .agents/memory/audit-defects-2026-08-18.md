---
name: Platform audit defects August 2026
description: Three defects found in the August 2026 platform audit; two open, one fixed.
---

# Platform Audit Defects -- August 2026

## D-001 (MEDIUM, OPEN) -- Status-override path bypasses refund ledger
`orders.service.ts:1390-1393` calls Stripe refund directly when overriding order status to `refunded`/`partially_refunded`. This skips the full ledger trail in `PaymentsService.createRefund` (no refund row, no credit row, no vendor clawback, no audit). Breaks payout reconciliation and chargeback ceiling.

**Fix:** Reject refund-status transitions in the override endpoint; force use of `POST /v1/admin/orders/:orderId/refunds`.

## D-002 (LOW, OPEN) -- Founding allowance restoration is non-atomic
`payments.service.ts:893-911` decrements `foundingAllowanceUsedPence` in a separate DB update AFTER the refund ledger transaction commits. A process crash between the two writes leaves the allowance under-restored. Refund itself is correct; only the counter is at risk.

**Fix:** Move the `foundingAllowanceUsedPence` decrement inside the same `$transaction` as the refund ledger writes.

## D-003 (LOW, OPEN) -- calculate() backfill ignores vendor discounts and founding allowance
`commission.service.ts:179-215` (`calculate()` method) recomputes commission from subtotal only. Does not account for vendor-funded discount deductions or founding allowance coverage. Not used in live order creation; risk is in analytics/reporting backfills if called on discount or allowance orders.

## D-004 (FIXED) -- Seed ordering bug
Sections 2c/2d/2e created fixtures before section 2b (cleanup deleteMany), causing immediate deletion. Fixed 18 Aug 2026 by reordering.
