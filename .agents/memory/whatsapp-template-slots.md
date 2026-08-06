---
name: WhatsApp template slot counts
description: Approved Twilio Content Template variable counts and builder keying rules for WhatsApp sends
---

# WhatsApp Content Template slot counts

Approved templates (verified via Twilio Content API, Jul 2026):
- 1 slot ({{1}}=firstName): event_quote_received, event_reminder_72h, event_balance_link
- 2 slots ({{1}}=firstName, {{2}}=orderNumber): order_confirmation, order_accepted, order_dispatched, delivery_confirmed, order_amendment_proposed, review_request
- 2 slots ({{1}}=firstName, {{2}}=£ net payout): payout_statement
- NO approved template carries an order total/amount slot except payout_statement.

**Why:** Meta enforces EXACT parameter counts - extra or missing contentVariables fail the send, they don't just render blank. The old generic 3-slot fallback over-sent for every template.

**How to apply:**
- WHATSAPP_PARAMS builders in notification.processor.ts are keyed by the Twilio Content Template name (`whatsappTemplate`), NOT the internal event name (they diverge, e.g. payout_batch_ready → payout_statement). Any new template needs a builder with the exact approved slot count.
- Verify slots by GET https://content.twilio.com/v1/Content/<SID> (basic auth SID:token) - `types["twilio/text"].body` shows the real {{n}} slots; the `variables` field is just sample values.
- Test sends: `npx tsx apps/api/scripts/send-test-content-template.ts <+E164> <template> '[params]'`. Sandbox sender (+14155238886) returns error 63015 if the recipient hasn't joined the sandbox (recipient must text the join code; sessions expire after 72h).
