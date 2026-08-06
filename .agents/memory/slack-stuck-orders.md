---
name: Slack alerts - stuck orders and queue failures
description: How Slack alerting works and which env var to set
---

# Slack alerting

## Rule
All Slack alerts go through `DlqMonitorService.sendSlack()` in `admin/dlq-monitor.service.ts`.
The webhook URL is `QUEUE_ALERT_SLACK_WEBHOOK_URL` (not `SLACK_WEBHOOK_URL`).
If the var is unset, alerts are logged as warnings - no crash, no silent drop.

**Why:** The DLQ monitor already had Slack for queue depth alerts; stuck-order alerting
was wired into the same service to avoid a second webhook var and a second cron.

## Stuck order detection
`DlqMonitorService.checkStuckOrders()` runs every 5 min.
Orders in `pending` status older than 30 min get a Slack alert.
Each order fires at most once per hour (Redis key `stuck-order-alert:<id>` with 1h TTL).
Threshold is `DlqMonitorService.STUCK_ORDER_MINUTES = 30`.

## How to apply
To activate: add `QUEUE_ALERT_SLACK_WEBHOOK_URL` to Replit secrets (Incoming Webhook URL
from Slack app settings → "Incoming Webhooks"). Both queue-depth and stuck-order alerts
will immediately start posting to that channel.
