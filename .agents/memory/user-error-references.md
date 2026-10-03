---
name: User-facing error references
description: Plain-language failures, private provider diagnostics, and genuinely persisted support references.
---

User-facing failures must use stable plain-language messages across customer, vendor, admin and API. Never render provider errors or stacks. Genuine empty datasets remain empty states.

**Why:** The user explicitly required these boundaries after internal errors reached several screens.

**How to apply:** Preserve provider diagnostics privately under the same persisted reference shown to the user. Reuse acknowledged API references rather than generating another incident with only sanitized details. A Next.js digest or a random correlation ID is not proof an incident was saved. If reporting fails, say the support reference is unavailable instead of claiming it was logged. Server-rendering failures need capture before Next.js removes their original details; successful API responses containing historical failure fields also need sanitization.