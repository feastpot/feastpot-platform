---
name: WhatsApp Twilio Content SID env naming
description: The Twilio Content SID env var keys off whatsappTemplate, NOT the template registry key - they diverge.
---

# WhatsApp Content SID env var naming

The Twilio WhatsApp backend looks up `TWILIO_CONTENT_SID_<name>` where `<name>`
is the dispatched message's `template` - which the notification processor sets to
`def.whatsappTemplate`, **not** the object key in the `TEMPLATES` registry.

For most templates key == whatsappTemplate, but they DIVERGE: e.g. registry key
`payout_batch_ready` has `whatsappTemplate: 'payout_statement'`, so the provider
reads `TWILIO_CONTENT_SID_payout_statement`.

**Why:** an architect review caught a `/healthz` config-visibility field that
enumerated registry keys and reported a false "missing SID" for payout WhatsApp.

**How to apply:** any code that enumerates WhatsApp templates to check/document
Content SIDs (healthz, .env.example, ops scripts) must use `def.whatsappTemplate`
(dedupe - multiple keys could share one whatsappTemplate), never the registry key.
