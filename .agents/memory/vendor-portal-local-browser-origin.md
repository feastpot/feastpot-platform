---
name: Vendor portal local browser origin
description: Local browser smoke-test origin required for vendor portal API calls.
---

Use `http://localhost:3002` for local browser automation against the vendor
portal, rather than `http://127.0.0.1:3002`.

**Why:** The development portal’s default API origin is
`http://localhost:3001`; browser requests from the IP-literal origin are
cross-origin and the API rejects their CORS preflight. The same portal flow
works at the localhost origin.

**How to apply:** For a Playwright or manual local sign-in walkthrough, target
the localhost vendor URL. This is a test-environment convention, not an
application routing change.