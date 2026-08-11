---
name: Vendor-acquisition analytics module
description: AnalyticsEvent model, AnalyticsModule, client hooks, and funnel instrumentation added Aug 2026.
---

## Rule
AnalyticsModule is @Global - inject AnalyticsService directly in any feature service; no module import needed. Pattern matches AttributionModule.

## Track() usage
Always fire-and-forget: `void this.analytics.track({...})`. Never await. Service swallows exceptions internally.

## Event allowlist
Client-accepted (POST /v1/analytics/events): vendor_page_view, calculator_interaction, application_start, application_complete, share_link_click, qr_scan.
Server-only (not in allowlist): order_attribution_source.

## QR URL convention
Generated QR URLs include `?m=qr` (or `&m=qr` when appended to canonicalLink). The /v/[slug]/route.ts handler reads `req.nextUrl.searchParams.get('m')` to detect scans. Existing stored QRs (pre-Aug 2026) lack the marker - only new generations have it.

## Anonymous visitor ID
`fp_anon` key in localStorage (not a cookie - no consent banner needed). getOrCreateAnonId() in apps/web/src/lib/analytics/anon-id.ts and apps/vendor/src/lib/analytics/anon-id.ts (kept separate, no cross-app dep).

**Why:** localStorage-based IDs don't require PECR/GDPR cookie consent notices. HttpOnly cookies would need consent; non-HttpOnly session cookies are already tracked separately (fp_sid).

## Migration
Migration 20260811130000_analytics_events applied via `db execute` and baselined in _prisma_migrations via the SELECT WHERE NOT EXISTS pattern (the table has no unique constraint on migration_name for ON CONFLICT).
