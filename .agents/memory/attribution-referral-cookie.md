---
name: Attribution referral cookie
description: Cookie names, formats, and flow for the order source attribution system
---

## Cookie format
- **fp_ref**: `referralLinkId|clickId|timestampMs` (7-day max-age, SameSite=Lax, not HttpOnly so JS can read)
- **fp_sid**: random UUID session identifier for deduplication (30-day max-age, SameSite=Lax, NOT HttpOnly)

## Flow
1. Customer visits `/v/[slug]` (Next.js route handler in `apps/web/src/app/v/[slug]/route.ts`)
2. Route reads/generates `fp_sid` cookie (stable per browser session)
3. POSTs click to `POST /v1/attribution/clicks` with hashed IP + UA fingerprint for dedup
4. API returns `{ referralLinkId, clickId }`
5. Route sets `fp_ref = referralLinkId|clickId|timestampMs` cookie and 302-redirects to the vendor's page on the main site
6. When customer places order, the web app reads `fp_ref` and `fp_sid` from cookies and passes them as request headers `X-Referral-Ref` and `X-Session-Id` to `POST /v1/orders`
7. `OrdersService.createOrder` calls `AttributionService.resolveAndWriteInTx` which writes the `OrderAttribution` row inside the order transaction; never throws (falls back to `MARKETPLACE`)

## How to apply
When debugging attribution gaps, check:
- `fp_ref` cookie present on the checkout page? → link click was tracked
- `OrderAttribution` row exists for the order? → attribution written successfully
- `OrderAttribution.source = VENDOR_REFERRED`? → attribution matched; otherwise `MARKETPLACE`
