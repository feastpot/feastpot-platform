# FeastPot Integration Test Report

_Run date: 22 May 2026 · against locally-running API (3001), Vendor (3002), Admin (3003), Web (3000)_

Two test layers were executed:

1. **API unit / integration Jest suite** (`apps/api`, 12 suites / 159 tests) — exercises guards, services and controllers in isolation with mocked Prisma/Stripe.
2. **End-to-end smoke script** (`scripts/smoke-test.ts`, `npm run smoke-test`) — drives a real customer → vendor flow against the live API + Stripe test mode using two seeded actors.

Plus surface-level health probes for the three actor entry points (customer API, vendor portal, admin portal).

---

## Headline

| Layer | Result |
| --- | --- |
| Jest suite | **131 pass / 23 fail / 5 skipped** across 4 passing + 7 failing + 1 skipped suites |
| E2E smoke | **❌ Fails at order-confirm step** — first 12 steps green, then API returns `500 "Connection is closed."` on `POST /v1/orders/:id/confirm` |
| Actor entry points | All three reachable; auth gates behave correctly |

The platform's externally-observable surfaces are alive and correctly authenticated, but a single backend dependency (BullMQ/Redis client closed) takes down the core "confirm order" call, and several unit suites are failing because of out-of-date test wiring after recent service refactors.

---

## 1. Actor entry-point probes

| Actor | Endpoint | Code | Verdict |
| --- | --- | --- | --- |
| Customer (API) | `GET /v1/vendors` | 200 | ✅ public discovery works |
| Vendor (portal) | `GET /sign-in` on :3002 | 200 | ✅ portal serves |
| Admin (portal) | `GET /sign-in` on :3003 | 200 | ✅ portal serves |
| Admin (API gate) | `GET /v1/admin/vendors` unauthenticated | 401 | ✅ guard rejects |
| API | `GET /health` | 404 | ⚠ no health endpoint mounted — only `GET /` works as liveness |

---

## 2. End-to-end smoke (customer → vendor → capture)

Script: `scripts/smoke-test.ts`. Seeded actors `grace@example.com` (customer) and `maman@feastpot.co.uk` (vendor / Tehran Sofreh).

**Steps that passed (12):**

1. API health check
2. Customer login via Supabase
3. Fetch vendors list
4. Fetch vendor menus
5. Fetch menu items
6. Available item present (`Chelo Kebab Koobideh (Full Tray) £44.00`)
7. Fetch customer addresses
8. Create order
9. `clientSecret` present on response
10. Stripe PI parsed (`pi_3Ta0mFJO3z8lSJX71vub5kCT`)
11. PI `capture_method = manual` (auth-on-order contract holds)
12. PI flips to `requires_capture` after Stripe confirm

**Step that failed (13):**

```
❌ Order confirmed via API
   POST /v1/orders/:id/confirm
   500 InternalServerError — "Connection is closed."
```

That string is the canonical BullMQ / ioredis error when the queue's underlying
Redis connection has been torn down. The order has been authorised on Stripe
but the API can't transition it to `confirmed` because enqueuing the
`auto_cancel` / lifecycle job throws. Subsequent vendor-accept, prep,
dispatch, delivered, capture and payout steps were therefore not exercised.

**Coverage gap:** because the smoke script is single-path and exits on first
failure, the admin actor's dispute / payout flow is not validated end-to-end
by any automated suite — it's only covered by the admin Jest specs (which
pass).

---

## 3. Jest results by suite

### ✅ Passing (4 suites, all green)

- `auth/guards/roles.guard.spec.ts` — `@Roles` decorator + RolesGuard
- `modules/payments/payments.service.spec.ts` — Stripe PI auth/capture/cancel/refund
- `modules/catalogue/menu-items.service.spec.ts` — menu item CRUD
- `modules/admin/admin.controller.spec.ts` — admin moderation endpoints

### ❌ Failing (7 suites, 23 tests)

| Suite | Failing tests | Root cause |
| --- | --- | --- |
| `modules/orders/orders.service.spec.ts` | 9 | `OrdersService` now depends on a `members` collaborator (vendor-membership service) for `canActOnVendor`, but the test bed doesn't provide it. Every authorization branch dies with `TypeError: Cannot read properties of undefined (reading 'canActOnVendor')`. Pure test-wiring drift — production code is fine. |
| `modules/vendors/vendors.service.spec.ts` | 3 | Same membership-service refactor leaked into vendor tests. |
| `modules/vendors/vendors.controller.spec.ts` | 4 + suite-level failure | Controller test bed fails to compile against the new DI graph; `GET /v1/vendors/debug` and the UUID-guard regression test all fail to run. |
| `modules/payouts/payouts.service.spec.ts` | 2 | Stripe transfer mock now triggers `STRIPE_TRANSFER_FAILED` because the test no longer stubs `stripe.transfers.create` to resolve. Happy-path + admin-actor variant both fail. |
| `modules/orders/order-slots.service.spec.ts` | 1 | "Rejects same-day orders when `sameDayOrders=false`" — service no longer throws; behaviour or fixture drifted. |
| `modules/catalogue/guards/vendor-ownership.guard.spec.ts` | 2 | Guard signature changed; both pass-and-fail branches throw at construction. |
| `auth/guards/supabase-auth.guard.spec.ts` | 2 | `mapUser` no longer reads role from the verified JWT claim in the way the test asserts; guard-attach test fails downstream. |

### ⏭ Skipped (1 suite)

- `e2e/vendor-onboarding-smoke.spec.ts` — gated behind an env flag; was not enabled in this run.

---

## 4. What this tells us about the three actors

### Customer
- Discovery, basket and order creation work end-to-end against a real database + real Stripe.
- The first observable breakage is on order confirmation (BullMQ Redis closed). Once that's restored, the rest of the lifecycle is untested today.

### Vendor
- Vendor portal serves; vendor-scoped Jest specs (`vendors`, `orders`, `vendor-ownership.guard`) are red because of the `members` service DI refactor that wasn't propagated into the test beds. No evidence the production behaviour is broken — `admin.controller.spec.ts` exercises the same `OrdersService` path successfully — but the safety net is offline.
- No automated test currently logs in as a vendor and accepts an order; smoke script stops one step earlier.

### Admin
- Auth gate verified (`401` without token).
- Admin controller specs pass.
- No automated test currently logs in as an admin and resolves a dispute or approves a payout; payout service specs that would have covered the approval are themselves failing on Stripe-mock wiring.

---

## 5. Recommended fixes (priority order)

1. **Restore Redis / BullMQ connection** — the `Connection is closed.` error on `/orders/:id/confirm` is the single blocker between "create order" and the rest of the lifecycle. Likely a stale BullMQ client after the API restarted or an unconfigured Redis URL.
2. **Re-wire `OrdersService` and `VendorsService` test beds** to provide a stub `MembersService` (or whatever the new collaborator is called) with a stub `canActOnVendor`. That alone clears 12 of the 23 failures.
3. **Restore the `stripe.transfers.create` mock** in `payouts.service.spec.ts` so the happy path returns a fake transfer instead of throwing.
4. **Reconcile `order-slots`, `vendor-ownership.guard`, and `supabase-auth.guard` specs** with the current implementations — these look like genuine behaviour drifts where either the test or the code needs to move.
5. **Add a `/health` endpoint** on the API so probes don't have to rely on `GET /` returning 200.
6. **Extend the smoke script** with explicit vendor-accept and admin-dispute branches so all three actors are covered by automation, not just the customer half.
