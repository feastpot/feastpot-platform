---
name: Authentication form fallbacks
description: Credential-safe authentication forms, browser tests and shared fixture password rotation.
---

Authentication forms must not rely solely on React preventing native submission; use POST so credentials cannot become URL query parameters if JavaScript fails.

**Why:** Signed-in browser verification encountered an unhydrated sign-in page. Native GET submission placed a shared test credential in the development request log.

**How to apply:** Preserve explicit POST semantics when changing authentication forms. Browser tests must wait for hydration, focus fields normally and wait for editability rather than removing readonly attributes. Click upload buttons and use the resulting file chooser instead of dispatching file changes before handlers attach.

Rotating the shared test password must cover remaining fixture identities in the authentication provider, not only the workspace secret or fixtures found in the application database.

**Why:** A development inventory found explicitly marked authentication fixtures surviving without matching application records. Updating the secret alone would leave their old passwords usable.

**How to apply:** Keep rotation development-only. Require explicit fixture provenance; Auth-only identities additionally need the internal test address convention. Change passwords only, preserving roles and MFA. Treat account deletion as separate, dry-run-first work requiring approval.