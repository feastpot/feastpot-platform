---
name: Rate Schedule version entries
description: Legal Rate Schedule versions and their display rows must remain complete and version-aligned.
---

Every newly published Rate Schedule version must receive a complete immutable snapshot of its entries in the same transaction as the version row. A version with no entries makes every public and vendor rate surface return an empty schedule.

**Why:** Rate Schedule entries are version-scoped. Creating a newer effective legal version without copying the rows causes the public endpoint to select that empty version even while an older version still has all canonical entries.

**How to apply:** Clone the current entry set when publishing a rate change and replace only the changed rate in the snapshot. For recovery, populate the currently effective empty version from the canonical snapshot and active commission records; do not reactivate or expose an obsolete version.

All current vendor-terms rate statements must match Annex A, including change
notes and plain-language summaries.

**Why:** The user explicitly required all rates in the vendor terms to match
the Rate Schedule. Legacy change notes can contradict the current schedule
even when the current commission figures are correct.

**How to apply:** Derive current figures from the schedule or reference Annex A
instead of repeating them. Preserve historical documents and acceptance hashes.
Corrections to published contract clauses require a new approved version;
presentation corrections must not silently rewrite the accepted agreement.