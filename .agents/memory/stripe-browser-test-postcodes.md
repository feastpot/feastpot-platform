---
name: Stripe browser test postal fields
description: Stripe can render a ZIP input even for a UK delivery address.
---

Do not assume the Stripe card billing postal input accepts the delivery postcode. In this workspace the test-card input rendered as ZIP and converted `SE15 4ST` into `154`, which Stripe rejected as incomplete.

**Why:** This blocked real payment outcomes after order creation and produced misleading generic payment errors.

**How to apply:** Use a valid test billing ZIP when the Stripe field renders as ZIP; retain the UK delivery address. Never weaken the real payment or cancellation assertions to accommodate an incomplete card field.