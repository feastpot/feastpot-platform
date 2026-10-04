---
name: Sitemap release gate
description: Commercial requirement for vendor sitemap completeness and handling an empty live catalogue.
---

Vendor sitemap completeness is a release requirement. Do not replace missing
required vendor data with a successful static-only sitemap, even before the
first publicly eligible seller exists.

**Why:** The user described postcode-first organic discovery as commercially
critical and said that a silently incomplete sitemap is worse than a failed
build because nobody notices.

**How to apply:** Preserve the fail-closed release gate when changing builds,
sitemap fetching or vendor publication. An empty eligible production catalogue
is a blocker to report, not permission to expose private/test sellers or
silently bypass verification.

CI and Vercel preview/development builds may omit sitemaps. Previews must be
non-indexable; delete stale sitemap files and prohibit crawling. Commercial
launch builds must still fail when the eligible live catalogue is missing.

**Why:** The user explicitly approved non-release builds before the first real
vendor is live so CI and preview validation can proceed independently of launch.

**How to apply:** Recognize explicit non-release provider environments only.
Vercel production always takes precedence over CI flags. Never generate a
static-only production sitemap or expose fixtures to satisfy the release gate.

The user approved explicit non-indexable production pre-launch builds on
4 October 2026. These may publish fixes before an eligible seller is live,
but must omit sitemaps and block indexing; normal launch builds retain the
eligible-vendor gate. This supersedes the earlier blanket ban on production
builds with an empty catalogue, not the commercial launch requirement.

**Why:** The customer Vercel production build was failing at the deliberate
empty-catalogue safeguard, preventing pre-launch fixes from being published.

**How to apply:** Keep pre-launch explicit, keep crawl and index prevention
consistent across artefacts and responses, and require a new launch-mode
build with eligible vendors before treating SEO release readiness as proved.