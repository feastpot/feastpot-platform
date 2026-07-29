# Feastpot — Implementation Audit (What's Yet To Be Implemented)

_Audited: 27 July 2026. Full-codebase sweep across `apps/api`, `apps/web`, `apps/vendor`, `apps/admin`, shared packages, Prisma schema, queues, notifications, Stripe webhooks, and env config._

Legend: 🔴 critical (money/data integrity) · 🟠 important (missing capability) · 🟡 polish/debt

---

## 1. Money & Financial Integrity (Backend)

- 🔴 **Chargeback loss reconciliation missing** — bank-initiated chargebacks are recorded (`apps/api/src/modules/payments/stripe-webhook.processor.ts:153`) but nothing reconciles order finances when a chargeback is _lost_. Matches proposed Task #45.
- 🔴 **No chargeback evidence-deadline warnings** — no cron/alert exists for approaching `evidence_due_by` deadlines. Matches proposed Task #46.
- 🔴 **Service-fee retention untracked on refunds** — `computeRefundSplit` (`payments.service.ts:58`) excludes the customer service fee from vendor clawbacks, but no revenue-adjustment/ledger row records that the platform retained it. Related to proposed Task #40.
- 🟠 **Payout CSV placeholders** — `PayoutsService.exportCsv` (`payouts.service.ts:229`) hardcodes `fees` and `adjustments` columns to zero (Stripe transfer fees not in schema; manual adjustments tracked elsewhere).
- 🟠 **Admin "Reconcile" is shallow** — Payouts screen reconcile (`apps/admin/src/app/payouts/payouts-client.tsx`) only checks Stripe Transfer IDs; no full ledger reconciliation.

## 2. Silent Failures & Missing Error Handling (Backend)

- 🔴 **Refund notifications swallowed** — `payments.service.ts:377` uses `Promise.allSettled` + `warn`; if the queue is down, money moves but neither customer nor vendor is told, with no retry.
- 🔴 **Audit-log writes can fail silently** — refund/dispute audit records are best-effort (`payments.service.ts:360`, `disputes.service.ts:731`); financial actions can proceed without a permanent audit trail.
- 🟠 **Vendor application emails swallowed** — `vendors.service.ts:363`; on failure the application exists in DB but is invisible to both parties.
- 🟠 **Unhandled Stripe events silently dropped** — the webhook controller enqueues _every_ event type (`stripe-webhook.controller.ts:99`) but the processor handles only a subset; everything else (e.g. `charge.succeeded`, `payout.failed`) is dropped without a catch-all log/alert (`stripe-webhook.processor.ts:251`).

## 3. Disputes & Chargebacks — Missing Capability

- 🟠 **No chargebacks UI anywhere** — `Chargeback` model exists in Prisma but neither admin nor vendor apps have a screen to view/manage/submit evidence. Matches proposed Task #44.
- 🟠 **Dispute escalation is a status flip only** — `DisputesService.escalate` (`disputes.service.ts:511`) sets `escalated`/`high` but performs no actual escalation (no notify, no queue, no response lock).
- 🟠 **Unimplemented dispute resolution types** — enum values `credit`, `rejected`, `escalated` (`prisma/schema.prisma:141-143`) have no handling; only `full_refund`/`partial_refund` implemented.
- 🟠 **Vendors cannot see or respond to disputes** — disputes UI exists only in admin (`apps/admin/src/app/disputes`).
- 🟡 **Evidence model unused** — `EvidenceType` (photo/document/screenshot, `schema.prisma:285-289`) has no service/DTO usage.
- 🟡 **Dispute stats sparse** — `DisputesService.stats` (`disputes.service.ts:244`) lacks the advanced KPIs (e.g., deadline-warning counts) referenced by recent tasks.

## 4. Notifications & Queues

- 🟠 **`notify_vendor` job has no template** — enqueued in `orders.service.ts:622` but no matching entry in `TEMPLATES`; falls through to generic drop-and-log in `notification.processor.ts`.
- 🟠 **Unregistered templates** — `vendor-portal-invite` / `staff-portal-invite` exist in `notifications/templates/` but are not in the `TEMPLATES` registry, so the processor can't send them.
- 🟠 **`order_confirmation` WhatsApp param mismatch risk** — no dedicated formatter in `WHATSAPP_PARAMS`; falls back to a generic 3-slot builder that may not match the approved Meta template.
- 🟡 **Inconsistent delivery paths** — vendor-application emails bypass the processor/registry and call `email.send` directly (`vendors.service.ts:347-350`).
- 🟡 **Stub provider mode can mask misconfiguration** — WhatsApp/email/SMS providers log-to-console in stub mode; health endpoint (`health.controller.ts:117`) exposes it but nothing alerts if prod lands in stub mode.

## 5. Orphaned / Dead Schema & Data

- 🟠 **Coverage waitlist is write-only** — `CoverageInterest` is populated via `coverage.controller.ts` but there's no admin read/export; ops can't see the waitlist.
- 🟡 **`OrderType.subscription`** (`schema.prisma:46`) — defined, never referenced.
- 🟡 **`VendorStatus.probation`** (`schema.prisma:39`) — no code path sets or handles it.

## 6. Customer Web App (`apps/web`)

- 🟠 **Review photo uploads "coming soon"** — `orders/[id]/review/page.tsx:264`; not saved to backend.
- 🟠 **Star-rating breakdown is estimated, not real** — `components/vendor/rating-breakdown.tsx:104-111` fakes per-star bars via a Gaussian estimate because the API only returns average + count; the "estimated" disclaimer was removed, so this now silently presents synthetic data.
- 🟠 **Referral code not in API** — confirmation page notes referral nudge is "static today (no /me referral code in API yet)" (`orders/[id]/confirmation/page.tsx:32`); no dedicated referral history section despite `getReferrals` existing.
- 🟡 **Loyalty tiers cosmetic** — tiers/milestones hardcoded in `components/account/loyalty-card.tsx:18-28`.
- 🟡 **Hardcoded support contacts fallback** — `help/page.tsx:119-120` (`+447000000000`, `support@feastpot.co.uk`).
- 🟡 **Terms text can drift** — service fee hardcoded as "currently £0 for customers" (`legal/terms/page.tsx:100`).
- 🟡 **SEO landing pages hardcode coverage areas** — `caribbean-food-delivery-london` / `ghanaian-food-delivery-london` pages may not reflect real vendor coverage.

## 7. Admin App (`apps/admin`)

- 🟠 **CSV exports "coming soon"** — users (`users/users-client.tsx:314`), review queue (`reviews/queue/reviews-queue-client.tsx:234`), events/enquiries (`events/events-client.tsx:184`).
- 🟡 **Bulk order selection disabled** — `orders/orders-client.tsx:338, 660`.
- 🟡 **"More filters" placeholders** — review queue (`:346`) and events (`:279-280`).
- 🟡 **Search trends card likely derived/simplistic** — `components/dashboard/search-trends-card.tsx`.
- 🟡 **"Critical" dispute severity chip skipped** — DB only supports low/medium/high (`disputes/disputes-client.tsx:50-54`).

## 8. Vendor App (`apps/vendor`)

- 🟠 **No dispute visibility** — vendors cannot see or respond to disputes (admin-only today).
- 🟡 **Analytics limited to derivable metrics** — `menu-stat-cards.tsx` notes only "derivable" metrics surfaced vs. designed depth.
- 🟡 **Mockup gaps** — "Menu best practices" CTA missing (`components/menu/menu-summary-rail.tsx:63`); delivery/collection + allergen icons missing from order details rail (`components/orders/orders-summary-rail.tsx:54`).
- 🟡 **Onboarding step flags** — completion relies on `stepFlags` (`onboarding/onboarding-client.tsx:64`); document verification flow still in flux.

## 9. Config / Env Hygiene

- 🟡 **`SUPABASE_DIRECT_URL`** declared in `schema.prisma:12` + `.env.example` but never read by app code (it IS used operationally for migrations/psql).
- 🟡 **`API_URL` mismatch** — `.env.example` lists `API_URL`; code reads `NEXT_PUBLIC_API_URL` / `API_PUBLIC_URL` (`vendors.service.ts:1416`).
- 🟡 **`TWILIO_FROM_NUMBER` vs `TWILIO_WHATSAPP_FROM`** — `.env.example` and code disagree; SMS provider has hardcoded fallback behavior.

---

## Suggested Priority Order

1. **Financial integrity**: chargeback-loss reconciliation, evidence-deadline alerts, service-fee retention ledger (Tasks #40/#44/#45/#46 already proposed).
2. **Silent failure hardening**: refund-notification retries, audit-log durability, Stripe unhandled-event alerting.
3. **Notification plumbing**: register missing templates, fix `notify_vendor`, add `order_confirmation` WhatsApp formatter.
4. **Missing screens**: chargebacks UI (admin), coverage-waitlist export, vendor dispute view.
5. **Web trust fixes**: real per-star rating counts (API + UI), review photo uploads, referral code in `/me`.
6. **Polish**: admin CSV exports, bulk actions, env-var cleanup, hardcoded copy.
