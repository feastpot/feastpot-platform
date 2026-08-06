---
name: Commission rate engine
description: Source-based commission rate system replacing hardcoded 12% commissionBps; key patterns and gotchas
---

## Architecture
- `CommissionRate` table: immutable rows, changes create a new row + close previous row's `effectiveTo`. Never mutate existing rows.
- `OrderCommission` table: written inside the same DB tx as the order row (inside `finishCreateOrder`), unique per order. Used for immutable audit + payout PDF generation.
- `CommissionModule` is `@Global()` — imported once in `AppModule`, injectable everywhere.
- Seed rates effective from 2020-01-01: MARKETPLACE first=12%, repeat=10%, VENDOR_REFERRED=0%.

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
