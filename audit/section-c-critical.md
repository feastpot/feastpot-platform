# Phase 4 — Money, Data Integrity, and Compliance Audit

**Scope:** audit only. No application source, dependencies, configuration, workflows, migrations, or test fixtures were changed.  
**Audit date:** 25 August 2026  
**Evidence sources:** static code tracing; the running development API; read-only queries against the development database; existing unit tests. Production configuration, Stripe, email, and live customer data were not changed or queried.

## Executive summary

| Severity | Finding | Evidence |
|---|---|---|
| **Critical** | Customer-publishable dishes can have no allergen declaration | 45 matching rows in the development database; one was retrieved anonymously through the public menu-item API with an empty allergen array and `allergensFreeFrom: false`. |
| **High** | Catering quotes below £50 can charge a deposit larger than the booking total and store a negative balance | Code permits totals from £1, then imposes a £50 minimum deposit without a cap. |
| **High** | Stripe webhook duplicate protection claims the event only after queueing it | Concurrent deliveries can both enqueue work before the unique event row is inserted. Runtime duplication count is **NOT VERIFIED** because this API returned 503 for signed webhooks. |
| **High** | Public error reports accept client-supplied vendor attribution | A live reversible request persisted a supplied real vendor ID. The incident was deleted afterward. |
| **High** | Stripe Connect `account.updated` is intentionally ignored | It is absent from the handled event list; the controller only records a warning for it. |
| **High** | Catering refunds bypass the refund ledger and payout reconciliation path | Direct Stripe refunds precede a non-transactional booking status update. |
| **Medium** | Payout PDF cannot reconcile to the payout batch when refunds/adjustments exist | PDF excludes refund, fee, and adjustment lines; it also compares dynamic commission against a flat 12% baseline. |
| **Medium** | Payout detail rows omit partially refunded orders even though batch totals include them | Static code mismatch between batch aggregation and detail lookup. |
| **Medium** | The development migration ledger has five rolled-back migrations | Database reads show 79 migration rows, including five with `rolled_back_at`; this is an integrity/deployment evidence gap, not proof that production is broken. |
| **Medium** | Staff MFA enforcement and operational alerting are opt-in configuration | Code warns but does not fail closed if MFA is off; Sentry and Slack alert configuration were not verified in production. |

## 1. Immediate customer-safety finding: allergen-less dishes are publicly visible

### Confirmed result

The development database has **45** menu items satisfying all of:

```sql
is_available = true
AND moderation_status IN ('auto_approved', 'approved')
AND COALESCE(array_length(allergens, 1), 0) = 0
AND allergens_free_from = false
```

An anonymous request to the public item endpoint for one such row returned:

```json
{
  "isAvailable": true,
  "allergenCount": 0,
  "allergensFreeFrom": false,
  "moderationStatus": "auto_approved"
}
```

This is customer-visible because the public read path permits available, approved/auto-approved items:

- `apps/api/src/modules/catalogue/menu-items.service.ts:100-112`
- `apps/api/src/modules/catalogue/menu-items.service.ts:172-184`

### Why the guard did not protect these rows

The current create/update code correctly blocks a new item from being made available when it has neither an allergen declaration nor an explicit “free from all 14” declaration:

- Create gate: `apps/api/src/modules/catalogue/menu-items.service.ts:205-220`
- Update/availability gates: `apps/api/src/modules/catalogue/menu-items.service.ts:481-503,562-567`

The issue is pre-existing data: the new gate does not retroactively change, unpublish, or flag rows that were created before it existed.

### Test evidence

The existing menu-item unit suite passed:

```text
PASS src/modules/catalogue/menu-items.service.spec.ts
Tests: 12 passed, 12 total
```

Those tests cover allergen slug validation and draft image ownership. They do **not** exercise the create/availability publish guard itself, so the public API/database evidence above is decisive.

### Required follow-up

Stop the affected items from being public until each has either:

1. one or more declared FSA allergens, or
2. an explicit `allergensFreeFrom = true` confirmation.

Add a regression test that creates and attempts to publish an item with `allergens: []` and `allergensFreeFrom: false`, then test a legacy row through the public endpoint.

## 2. Stripe webhook idempotency is vulnerable to a concurrent enqueue race

### Code path

`apps/api/src/modules/payments/stripe-webhook.controller.ts`:

1. checks whether `ProcessedWebhookEvent` already exists;
2. enqueues the Stripe event;
3. inserts the unique processed-event row.

The unique `stripeEventId` constraint exists in `prisma/schema.prisma` and the payments/payouts migration, but it is claimed **after** the externally observable queue side effect. Two concurrent Stripe deliveries can both see no row and each enqueue a job; only the later insert is rejected.

This can cause duplicate processor execution, duplicate queue failure/alert noise, and duplicate downstream side effects unless every individual processor action is independently idempotent.

### Runtime test limitation

A reversible two-request concurrency harness was prepared using a synthetic `transfer.created` event that could not match a payout. The local API refused the signed probe with:

```json
{
  "status": 503,
  "code": "WEBHOOK_NOT_CONFIGURED"
}
```

The development runtime has the live Stripe secret name available but no test webhook secret; in its active non-production mode the application resolves the missing test value and correctly fails closed. Therefore:

- concurrent HTTP response count: **NOT VERIFIED**
- duplicate queue jobs: **NOT VERIFIED**
- processed-event row count during an accepted delivery: **NOT VERIFIED**
- duplicate payment, payout, email, or notification effect: **NOT VERIFIED**

No audit event was successfully inserted. The probe’s processed-event cleanup was confirmed; no audit queue job was created or removed.

### Required follow-up

Atomically claim `stripeEventId` before queueing, treating a unique-conflict as an already-accepted delivery. Then test concurrent signed deliveries in an environment with the matching webhook secret and verify exactly one queue job, one processed-event row, and one business effect.

## 3. Catering arithmetic and refund integrity

### 3.1 Deposit can exceed total

Both quote paths permit totals from 100 pence (£1) and calculate:

```ts
depositPence = Math.max(5000, Math.ceil(totalPence * 0.25));
balancePence = totalPence - depositPence;
```

Evidence:

- `apps/api/src/modules/catering-bookings/catering-bookings.service.ts:42-45`
- Quote creation validation/calculation: `:100-113`
- Assigned-booking quote fill: `:1128-1136`

For any £1.00–£49.99 quote, this creates a deposit greater than the total and a negative balance. For example, a £1 quote produces a £50 deposit and a -£49 balance.

There are no catering booking rows in the audited development database, so no stored negative balance exists there today. This is nevertheless a code-proven high-risk defect.

### 3.2 Catering refunds bypass the normal financial ledger

Cancellation refunds call Stripe directly:

- Full/partial refund logic: `apps/api/src/modules/catering-bookings/catering-bookings.service.ts:578-626`
- Booking status change after Stripe calls: `:628-635`

The service comments acknowledge catering has no `PaymentsService` ledger integration. Consequently, these refunds do not create the normal refund/credit ledger pair, do not net a payout, and are not included in normal chargeback reconciliation. A database failure after Stripe has refunded the customer leaves the booking uncancelled.

### 3.3 Catering commission basis needs a commercial decision

Quote creation and quote fill pass the full catering total as `subtotalPence`, with no distinct service fee, delivery fee, or discount:

- `apps/api/src/modules/catering-bookings/catering-bookings.service.ts:121-137`
- `apps/api/src/modules/catering-bookings/catering-bookings.service.ts:1148-1157`

Payout is then total minus commission. This is internally consistent, but it means commission is charged on the entire quote total. Confirm this is the intended commercial basis.

## 4. Order, refund, commission, and service-fee findings

### Normal order calculation

The ordinary order path separates customer service fee from vendor payout and calculates commission in integer pence:

- Order creation: `apps/api/src/modules/orders/orders.service.ts:120-169`
- Commission service: `apps/api/src/commission/commission.service.ts:137-169`
- Canonical fee calculation: `packages/config/src/service-fee.ts`

The fee is 5% of subtotal, capped at 299 pence. A read-only development-database check found:

| Check | Result |
|---|---:|
| Orders with vendor payout greater than total | 0 |
| Orders with negative financial components | 0 |
| Orders not matching the ordinary 5%/299p fee formula | 8 |
| Of those, zero-fee exceptions | 8 |
| Of those, nonzero incorrect fees | 0 |
| FeastPass saving records | 0 |
| Zero-fee exception orders with saving records | 0 |

The code permits FeastPass fee waivers for active members on marketplace-sourced orders (`orders.service.ts:543-551`). However, the audited database has no `feast_pass_savings` records, so the eight zero-fee orders cannot be validated from the expected savings evidence. This is **not yet proof of an overcharge or undercharge**, but each must be reconciled to its customer membership, source attribution, and payment record.

### Refund and chargeback controls

Normal refunds have stronger controls:

- Refund split and incremental cap: `apps/api/src/modules/payments/payments.service.ts:54-156`
- Ledger/payout atomic work: `:648-865`
- Existing refund concurrency specifications: `refunds.spec.ts` and `refund-chargeback-concurrency.integration.spec.ts`

However, lost-chargeback processing calculates the split non-incrementally (`apps/api/src/modules/payments/stripe-webhook.processor.ts:423-455`). When prior partial refunds exist, this can differ from the incremental manual-refund path. Unmatched Stripe disputes are logged and sent to Sentry rather than automatically reconciled (`:373-387`).

### Payment capture external-state gap

`PaymentsService.capturePayment()` calls Stripe capture and only then creates the successful local capture row:

- `apps/api/src/modules/payments/payments.service.ts:269-305`

If Stripe succeeds but the database insert fails, a captured Stripe payment can lack a local capture row. This cannot be made a single database transaction with Stripe; it needs reconciliation.

## 5. Payout calculation and statement accuracy

### Batch arithmetic

The weekly batch correctly uses the stored per-order vendor payout rather than recomputing gross minus commission:

- Batch aggregation: `apps/api/src/modules/payouts/payouts.service.ts:166-186`
- Refund netting and persisted totals: `:849-981`

Read-only development-database results:

| Check | Result |
|---|---:|
| Core orphan orders/payments/payouts/chargebacks | 0 |
| Transferred payouts without transfer IDs | 0 |
| Non-transferred payouts with transfer IDs | 0 |
| Payout rows available to generate/inspect a statement | 0 |

### Detail/PDF inconsistency

`listPayoutOrders` includes only delivered orders (`payouts.service.ts:1118-1123`), while batch creation includes delivered **and partially refunded** orders (`:849-860`). A statement detail view/PDF can therefore omit an order that its totals include.

The PDF summary includes only gross sales, commission, blended rate, and net payout:

- PDF input/summary: `apps/api/src/modules/payouts/payouts.service.ts:1289-1304,1390-1413`

It omits refund, fee, and adjustment lines. It also calculates the “saved” comparison against a hard-coded flat 12% rate (`:1391-1395`) despite dynamic commission rates. This makes the document materially hard to reconcile to a refunded batch.

CSV has derived residual “fees” and “adjustments,” but its code comment and `docs/OUTSTANDING.md` still describe them as placeholder zero columns (`payouts.service.ts:103-135,315-323`). The column meaning should be made explicit before vendors rely on it.

No live statement was generated because the audited development database contains no payout rows.

## 6. Error incident attribution is spoofable

`POST /v1/error-incidents` is deliberately public:

- `apps/api/src/modules/error-incidents/error-incidents.controller.ts:14-37`

The endpoint accepts `vendorId` and `userId` from the client. A reversible runtime request supplied a real vendor ID retrieved from public vendor search. It returned 201 and the database stored that supplied ID as the incident’s vendor attribution. The audit row was deleted immediately afterward.

The staff-only read endpoints are correctly role-gated (`error-incidents.controller.ts:40-57`), but this does not prevent poisoned attribution in the records staff review.

Use the authenticated principal when present; otherwise treat client identifiers as untrusted diagnostic context rather than authoritative ownership.

## 7. Stripe Connect capability changes are not processed

`account.updated` is missing from:

- `apps/api/src/modules/payments/stripe-webhook.events.ts:15-31`

Unhandled Stripe event types are recorded and warned about, but not enqueued:

- `apps/api/src/modules/payments/stripe-webhook.controller.ts:104-125`

Stripe Connect changes therefore do not update local onboarding/payout-capability state through webhooks. Manual capability refresh in vendor code does not replace an authoritative asynchronous update. This is a confirmed integration gap.

## 8. Authorization, MFA, pricing, claims, and terms

### Vendor/admin authorization

Static tracing found:

- Vendor menu ownership is checked by `vendor.userId === caller.id`; admin/compliance receive the intended elevated access: `menu-items.service.ts:190-203`.
- Public menu reads force `isAvailable = true` and approved moderation state: `:100-112`.
- Terms acceptance derives effective vendor identity server-side and does not let administrators accept for vendors: `apps/api/src/modules/terms/terms.controller.ts:184-214`.

Vendor-token and admin-token endpoint matrices were **NOT VERIFIED** in a fully provisioned authenticated runtime. The source gate is positive evidence, not a substitute for end-to-end authorization tests.

### Staff MFA

The admin middleware and server gate enforce AAL2 only if the relevant flag is true:

- `apps/admin/src/middleware.ts:76-93`
- `apps/admin/src/lib/auth/server-gate.ts:82-89`

Production logs a warning but continues password-only if `ADMIN_REQUIRE_AAL2` is absent or false:

- `apps/api/src/main.ts:143-155`

Whether the API and admin production deployments enable both required flags is **NOT VERIFIED**.

### Pricing disclosure and unsupported claims

The customer vendor card, vendor detail page, and checkout expose the “up to £2.99 service fee” before ordering:

- `apps/web/src/components/vendor/vendor-card.tsx:164`
- `apps/web/src/app/vendors/[slug]/page.tsx:502-507`
- `apps/web/src/app/checkout/page.tsx:677-688`

The searched numeric marketing candidates were fee examples, commission facts, and UI copy rather than unsubstantiated traction/review claims. No hard-coded “served X customers,” rating, vendor-count, or order-count marketing claim was confirmed in this pass. Legal compliance and every responsive route remain **NOT VERIFIED**.

### Vendor terms

The database contains:

| Version | Published | Effective | State | Acceptance records |
|---|---|---|---|---:|
| 1.0 | 1 May 2026 | 1 May 2026 | superseded | 0 |
| 2.0 | 8 Aug 2026 | 23 Sep 2026 | unsuperseded, pending effective date | 0 |

The version/acceptance model has positive controls: publish-time hash, solicitor sign-off/notice requirements, and append-only acceptance evidence:

- `apps/api/src/modules/terms/terms.controller.ts:30-39,184-214`
- `apps/api/src/modules/terms/terms.service.ts:697-700,814-840`

The unusual state—an effective version marked superseded while the unsuperseded replacement is still pending—should be checked against the service’s “current version” selection before 23 September. The report does not assume this is a customer-facing failure without a timed API test.

## 9. Database integrity, migrations, monitoring, and alerting

### Referential integrity

The sampled read-only orphan checks found zero orphan core orders, payments, payouts, and non-null chargeback relationships. The schema nevertheless has several user/actor-like values without foreign keys, including:

- `Order.cancelledBy`: `prisma/schema.prisma:1057-1059`
- `Payout.approvedById`: `:1417-1425`
- `VendorTaxProfile.verifiedById`: `:185-196`

These fields can preserve historical actors, but the database cannot enforce that they reference an existing user.

### Migration evidence

The development `_prisma_migrations` ledger has:

```text
79 total migration rows
5 rows with finished_at IS NULL
5 rows with rolled_back_at IS NOT NULL
```

The rolled-back entries are:

```text
20260801182600_add_vendor_trust_signals_and_capacity
20260805130000_add_order_allergen_confirmed
20260806150000_add_commission_rate_engine
20260811000000_attribution_source_enum
20260811010000_catering_attribution_enum
```

Repository CI/deploy wiring runs `prisma migrate deploy`, but this audit did not query production migration state. The development ledger requires review before treating it as a clean migration baseline.

### Observability and queue alerting

Sentry is initialized early and has queue/webhook capture paths, but it is explicitly disabled when `SENTRY_DSN` is absent:

- `apps/api/src/instrument.ts:1-23`

Queue monitoring runs every five minutes and has Sentry/optional Slack alert paths:

- `apps/api/src/queues/queue-depth-monitor.service.ts:80-105,149-205`
- Optional Slack configuration: `apps/api/src/common/config/required-env.ts:81-84`

Production Sentry DSN and Slack queue-alert configuration are **NOT VERIFIED**. The queue monitor also skips its own checks while Redis is unavailable, so independent Redis monitoring is required.

## 10. Test and environment limitations

1. **Stripe webhook concurrency:** not executable locally because accepted signed webhooks return `WEBHOOK_NOT_CONFIGURED` (503). No duplicate business effect was inferred.
2. **Stripe payments, transfers, refunds, and emails:** no live Stripe calls were made.
3. **Payout statements:** no payout rows existed in the development database.
4. **Catering stored balances:** no catering bookings existed in the development database.
5. **Vendor/admin endpoint matrix and AAL2 enforcement:** not run with fully provisioned vendor/admin identities.
6. **Production migration/configuration/monitoring:** not queried or changed.
7. **Accessibility/legal compliance:** outside the evidence available in this audit.

## Recommended remediation order

1. Immediately unpublish or require declarations for the 45 allergen-less public dishes, then add a legacy-data remediation and regression test.
2. Fix the catering minimum-deposit formula before enabling low-value quotes; cap the deposit at total or enforce a £50 minimum quote total.
3. Make webhook event claiming atomic before queue insertion and run a concurrent-delivery regression test.
4. Replace client-supplied incident ownership with server-derived attribution.
5. Add `account.updated` processing and alert on capability changes that make payouts unavailable.
6. Bring catering refunds into the ledger/payout/chargeback reconciliation model.
7. Align payout detail, CSV, and PDF data definitions; include refunds/fees/adjustments in vendor-facing statements.
8. Reconcile the eight unexplained zero-fee orders and the five rolled-back migration entries.
9. Verify production MFA flags, Sentry DSN, Slack alerting, webhook secret, and production migration status.