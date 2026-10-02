---
name: Commission rate engine
description: Source-based, effective-dated commission rates and the legal/display boundary
---

## Architecture
- `CommissionRate` table: immutable rows, changes create a new row + close previous row's `effectiveTo`. Never mutate existing rows.
- `OrderCommission` table: written inside the same DB tx as the order row (inside `finishCreateOrder`), unique per order. Used for immutable audit + payout PDF generation.
- `CommissionModule` is `@Global()` — imported once in `AppModule`, injectable everywhere.
- Rate changes append a new half-open effective window; existing scheduled future rows remain intact and an immediate row may bridge only to the next future start.

**Why:** Historical order calculations must keep resolving against the rate that was effective when the order was created, while announced future rows must not be overwritten.

**How to apply:** Reject equal start instants, enforce `effectiveTo > effectiveFrom`, close only overlapping prior rows, and resolve with `effectiveFrom <= at < effectiveTo`.

## Legal and display boundary

Catering is its own commission segment: standard catering is 10%; when the vendor brings their own catering client, it is 5%. Ordinary vendor-referred orders remain separate. All catering quote paths must share one calculation and use integer pence, never marketplace first-order or repeat rates.

**Why:** The user explicitly required the catering separation after both quote paths were found resolving marketplace commission, then confirmed "5%" for vendor-referred catering.

**How to apply:** Keep catering calculations independent of marketplace attribution and rate changes; preserve historical financial records rather than silently recalculating them.

The targeted catering fix uses canonical configuration rather than the ordinary order rate table, whose source enum contains only marketplace and ordinary vendor referral. Catering snapshots retain the charged percentage but do not claim a marketplace rate-row ID.

**Why:** The user required fixed catering rates and a narrow fix, without silently modifying historical financial data.

**How to apply:** If catering later moves to effective-dated database rates, introduce a distinct catering segment; never use ordinary vendor-referred rates as a shortcut.

- Commission percentages belong in the canonical Rate Schedule, not in the numbered Vendor Terms clauses. Contract body copy points to Annex A.
- Repeat-order commission and the customer service fee must always be named explicitly because they can share the same percentage but affect different parties.

**Why:** Duplicated figures caused the contract, marketing copy, admin defaults, and billing engine to drift. A bare percentage is also ambiguous between a vendor deduction and a customer charge.

**How to apply:** Billing reads `CommissionRate`; public/legal UI reads `RateScheduleEntry`; shared copy may use the canonical config definition, never a new literal. Publishing substantive Vendor Terms wording still requires fresh solicitor sign-off.

## Prisma nullable boolean filter
Prisma's `BoolNullableFilter` does NOT support `{ in: [value, null] }`. Use nested OR:
```ts
AND: [
  { OR: [{ isFirstOrder: isFirstOrder }, { isFirstOrder: null }] },
  { OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }] },
],
```
`isFirstOrder: null` on a `CommissionRate` row means "applies regardless of first/repeat".

## preResolveSource pattern
`AttributionService.preResolveSource(fpRef, sessionId, customerId, vendorId)` resolves source+isFirstOrder read-only, BEFORE the order tx. `resolveAndWriteInTx` still writes authoritatively inside the tx. Both must agree on the logic.

## Payout PDF
- `pdfkit` (CommonJS): `const PDFDocument = require('pdfkit')` pattern with a typed cast avoids ESM issues.
- PDF generated in `PayoutsService.buildPayoutStatementPdf`, encoded as base64, stored in the Bull job payload (`pdfBase64`, `pdfFilename`).
- `NotificationProcessor` handles `payout_batch_ready` as a special case BEFORE the template lookup so email can carry the PDF attachment; WhatsApp goes through normal dispatch (no attachment).

## Blended rate alert
`runWeeklyBatch` logs a warning if blended take rate is outside [6%, 10%] for the period. This is a log-only alert; Slack integration can be added later.

## 15-day notice enforcement
`POST /admin/commission-rates` checks if the new ratePercent > current active rate for the same slot. If yes, enforces `effectiveFrom >= now + 15 days`. Uses listRates() + comparison, not a hook.

## Backfill
`CommissionService.calculate(orderId)` upserts OrderCommission for existing orders using their stored OrderAttribution. Orders without attribution default to MARKETPLACE/isFirstOrder=true.
