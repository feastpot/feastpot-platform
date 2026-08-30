# Published allergen remediation measurement

## Production measurement

Measured on 30 August 2026 before any write using the production direct
connection. The query selected available menu items where `allergens` was empty
and `allergens_free_from` was false, grouped by vendor.

- Affected items: **0**
- Affected vendors: **0**
- Vendor groups: none

No production rows were changed because there was no exposure to remediate.

## Recovery approach

The remediation command records each affected item's prior availability in
`menu_item_allergen_remediations` before making the item unavailable. It is
read-only unless all of `--production`, `--apply`, and a matching
`--confirm-count=N` are supplied.

After the vendor declares at least one FSA allergen or confirms that none of the
14 apply, an explicit republish restores the item's prior live state and records
`restored_at`. The remediation record remains as an audit trail.
