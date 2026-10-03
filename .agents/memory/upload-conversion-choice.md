---
name: Browser HEIC conversion
description: The user's infrastructure-cost decision for upload normalisation
---

Keep HEIC conversion in the browser rather than adding native HEIC decoding to the API.

**Why:** the user chose browser conversion to control infrastructure cost.

**How to apply:** preserve this boundary during upload remediation and dependency upgrades. Updating Next's existing image optimiser does not authorise adding API-side HEIC processing.