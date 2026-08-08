---
name: Dispute appeals
description: P2B clause 18.1-18.3 appeal workflow - key decisions and invariants.
---

## Key decisions

- **Extend `Dispute` model** rather than create a parallel `DisputeCase` - the brief's `DisputeCase` mapped 1:1 to the existing model.
- **`DisputeAppealsService`** is a separate service in the DisputesModule, not bolted onto the already-large DisputesService.
- **`raisedByParty DisputeParty`** added as a new field (existing `raisedBy` is already a User relation name).
- **`refundPence`** stored on Dispute at close time so upheld appeal can reverse the exact deduction without re-deriving it.
- **Payout reversal strategy**: find vendor's latest `draft` payout → `increment amountPence, decrement refundsPence`; if none found → create a new draft credit-only row. Handle P2002 gracefully (batch race).

## Invariants enforced by tests

- Appeal window (APPEAL_WINDOW_DAYS = 14 calendar days) > ack commitment (APPEAL_ACK_BUSINESS_DAYS = 5 biz days = max 7 cal days).
- Stage 2 reviewer `user.id` must !== `appeal.stage1By` — service throws ForbiddenException({ code: 'SAME_REVIEWER' }).
- "decision is final" phrase must not appear in any non-spec TypeScript file — grep test must pass `--exclude="*.spec.ts"` or the spec finds itself.

## Notification templates added

- `dispute_appeal_submitted` — notifies admins of new appeal (grounds preview).
- `dispute_appeal_decided` — vendor notified of stage1 or final stage2 outcome; UPHELD stage2 tells vendor credit is applied.
- `dispute_appeal_payout_credit` — confirms the credit amount to the vendor.

## Response windows (clause 18.1)

- `create()` now calculates `vendorRespondBy` (48h standard / 24h urgent) and mirrors it to `platformRespondBy` (reciprocity).
- `close()` now sets `decision` (mapped from ResolutionType), `decidedAt`, `decidedById`, `platformRespondedAt`, `refundPence`.
- The `Dispute.decision` field uses `DisputeDecision` enum: UPHELD_CUSTOMER / UPHELD_VENDOR / PARTIAL.
- Mapping: full_refund/partial_refund → UPHELD_CUSTOMER; rejected → UPHELD_VENDOR; credit → PARTIAL.

**Why:** P2B regulations require measurable platform SLA adherence and a genuine two-stage appeal process. The different-reviewer rule prevents a single person from both making and reviewing the same decision.
