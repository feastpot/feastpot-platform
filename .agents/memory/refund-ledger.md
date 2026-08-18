---
name: Refund ledger invariants
description: Durable accounting invariants for refunds, clawbacks, and payouts.
---

1. Payout aggregation is PaymentStatus-agnostic: a refund's row group must always net to the intended vendor deduction, whatever state the refund ends in.
2. Vendor earnings are settled exactly once. Once an order's money is captured in a payout, it must be recovered where it sits (adjust an unsent payout, reverse a sent transfer); no later aggregation will revisit it.
3. Money-moving idempotency keys are per business attempt: a Stripe reversal that was paid back must never be retried under its original key (Stripe replays it and moves nothing).
4. Retries and concurrent duplicates must converge to exactly one net refund and one net clawback; a losing racer must check whether the shared operation already committed before undoing anything.
5. Full vs partial refund is cumulative against the order total, not per-amount.
6. When automatic clawback collection fails, the reconciliation stands and an explicit operational-debt record is written for manual recovery — never silently drop it.
