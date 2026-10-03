---
name: API deployment image size
description: Keep frontend build caches and browser-test binaries out of the API publishing snapshot
---

Trim frontend-generated output and test-browser caches only in the API publishing snapshot, never in the live development workspace or frontend builds.

**Why:** Replit's deployment image included the monorepo's generated frontend caches and Playwright browser downloads, exceeding the 8 GiB limit even though API compilation succeeded. Git-ignored generated files were still present in the publishing snapshot.

**How to apply:** preserve API output, dependencies, source and migrations. Keep the fixed-path cleanup at the end of the API-only publishing build; use read-only inspection locally. The next publish, not a passing compilation, confirms the final image fits.