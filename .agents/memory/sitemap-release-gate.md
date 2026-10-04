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
non-indexable; delete stale sitemap files and prohibit crawling. Production
must still fail when the eligible live catalogue is missing.

**Why:** The user explicitly approved non-release builds before the first real
vendor is live so CI and preview validation can proceed independently of launch.

**How to apply:** Recognize explicit non-release provider environments only.
Vercel production always takes precedence over CI flags. Never generate a
static-only production sitemap or expose fixtures to satisfy the release gate.