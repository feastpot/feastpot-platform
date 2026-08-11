---
name: Attribution referral cookie
description: Cookie names, formats, expiry windows, and flow for the three-tier order source attribution system
---

## Cookie formats and expiry windows

| Cookie | Format | Max-Age | Purpose |
|--------|--------|---------|---------|
| `fp_ref` | `referralLinkId|clickId|timestampMs` | 30 days | VENDOR marker: set by /v/[slug] when customer clicks vendor's referral link |
| `fp_sid` | UUID string | 30 days | Session ID for cookie-loss fallback (not HttpOnly) |
| `fp_mp_{vendorId}` | `timestampMs` | 90 days | MARKETPLACE marker: set by `MarketplaceTagger` client component when customer browses a vendor via postcode search |

## Three-tier commission tiers

`OrderSource` enum in Prisma: `MARKETPLACE` and `VENDOR_REFERRED`.
`AttributionSource` enum (new): `VENDOR_REFERRED` (0%), `MARKETPLACE_FIRST` (12%), `MARKETPLACE_REPEAT` (10%).
Commission resolution uses `source + isFirstOrder`; `resolvedSource` on `OrderAttribution` is the derived three-tier label.

## Override rule

MARKETPLACE marker (90-day) always beats VENDOR marker (30-day) for the same vendor:
1. `/v/[slug]` route: reads `fp_mp_{vendorId}` cookie before setting `fp_ref`; if marker valid, suppresses `fp_ref` cookie.
2. `AttributionService.preResolveSource` / `resolveAndWriteInTx`: if `marketplaceMarker` arg is valid (within 90d), forces `source=MARKETPLACE` without querying the referral link table.

## Bot detection

`/v/[slug]` checks `user-agent` against `BOT_UA_RE` regex before recording any click or setting cookies. Bots redirect to /vendors without side effects.

## Order creation header flow

Web app reads all three markers from `document.cookie` (+ localStorage fallback for `fp_mp_*`) inside `buildAttributionHeaders(vendorId)` in `hooks/use-orders.ts`. Passes them as:
- `X-Fp-Ref` → `fpRef` in `OrdersService.createOrder`
- `X-Fp-Sid` → `sessionId`
- `X-Fp-Mktplace` → `marketplaceMarker`

`apiRequest` in `lib/api/client.ts` now accepts optional `headers` field; `createOrder` in `lib/api/orders.ts` accepts optional `extraHeaders`.

## Attribution write

`AttributionService.resolveAndWriteInTx` writes `OrderAttribution` inside the order transaction, including:
- `resolvedSource` (derived from `source + isFirstOrder` via `toResolvedSource()`)
- `markerSetAt` (timestamp of the winning marker, or null for organic)

## Debug checklist

- `fp_mp_{vendorId}` in DevTools > Cookies? → marketplace marker set (customer browsed via search)
- `fp_ref` cookie present? → customer arrived via /v/[slug] referral link AND marketplace override did not suppress it
- `OrderAttribution.resolvedSource`? → final three-tier result
- `OrderAttribution.attributionReason`? → `marketplace_marker` / `fp_ref_cookie` / `session_fallback` / `organic`
