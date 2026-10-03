---
name: Authentication form fallbacks
description: Credential-safe native submission and hydration-aware browser authentication.
---

Authentication forms must not rely solely on React preventing native submission; use POST so credentials cannot become URL query parameters if JavaScript fails.

**Why:** Signed-in browser verification encountered an unhydrated sign-in page. Native GET submission placed a shared test credential in the development request log.

**How to apply:** Preserve explicit POST semantics when changing authentication forms. Browser tests must wait for hydration, focus fields normally and wait for editability rather than removing readonly attributes. Click upload buttons and use the resulting file chooser instead of dispatching file changes before handlers attach.