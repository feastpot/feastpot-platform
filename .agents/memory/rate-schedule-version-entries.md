---
name: Rate Schedule version entries
description: Legal Rate Schedule versions and their display rows must remain complete and version-aligned.
---

Every newly published Rate Schedule version must receive a complete immutable snapshot of its entries in the same transaction as the version row. A version with no entries makes every public and vendor rate surface return an empty schedule.

**Why:** Rate Schedule entries are version-scoped. Creating a newer effective legal version without copying the rows causes the public endpoint to select that empty version even while an older version still has all canonical entries.

**How to apply:** Clone the current entry set when publishing a rate change and replace only the changed rate in the snapshot. For recovery, populate the currently effective empty version from the canonical snapshot and active commission records; do not reactivate or expose an obsolete version.