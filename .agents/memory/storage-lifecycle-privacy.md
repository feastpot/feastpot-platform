---
name: Storage lifecycle privacy
description: Privacy priorities and provider quirks when changing Feastpot upload cleanup.
---

Treat superseded/deleted private files as a privacy obligation, not only storage-cost cleanup.
Keep inventory reports separate from deletion approval; the user required the first orphan
run to be report-only.

**Why:** The user explicitly said privacy outranks cost.

**How to apply:** Preserve durable deletion intent on failed writes or detachments,
re-check shared owners, and never turn an inventory's discovered orphans into automatic deletes.

Supabase can return a generic HTTP 400 from HEAD for a physically absent object.
An acknowledged removal is not enough: verify existence and, when HEAD is ambiguous,
use GET's structured 404 plus metadata absence. Do not classify arbitrary 400s as absence.

**Why:** Real development verification reproduced this provider behaviour; relying on
the SDK's HEAD result alone falsely recorded successful deletions as failures.

**How to apply:** Keep the structured-404 fallback when modifying deletion verification
or upgrading the Storage SDK.