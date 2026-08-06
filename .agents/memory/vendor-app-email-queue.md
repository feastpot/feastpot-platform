---
name: Vendor application email queue pattern
description: Vendor application emails now route through Bull, not direct sends; and the raw-email job type pattern
---

# Vendor application email retry pattern

## Rule
Vendor application emails (admin notification + applicant acknowledgement) are enqueued as
`vendor_application_email_raw` jobs on the `NOTIFICATIONS_QUEUE` with `attempts: 3, backoff: exponential 30s`.
The processor handles this job name BEFORE the template lookup block.

**Why:** Fire-and-forget email sends silently fail on Resend outages; Bull retries make
the lead visible and retried without manual ops intervention.

**How to apply:** Any new "raw email" (no template, no userId) should use the same
`vendor_application_email_raw` job name with `{ to, subject, html }` payload.
The processor validates all three fields non-empty before sending.

## Payout failure alerts
Failed Stripe transfers also enqueue a `vendor_application_email_raw` job to the finance
address (FINANCE_ALERT_EMAIL → VENDOR_APPLICATIONS_ADMIN_EMAIL → soul@feastpot.co.uk).
Finance resets the payout via `POST /v1/payouts/:id/reset` then re-approves.
