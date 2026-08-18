---
name: AuditLog action names (vendor + order)
description: Canonical action strings for the audit_logs table; what each path writes and where it is set.
---

# AuditLog action names

## Vendor status changes

| Path | Action | actorId |
|------|--------|---------|
| `vendors.repository.transitionStatus()` (manual PATCH /vendors/:id/status) | `vendor.status_changed` | human UUID |
| `vendor-enforcement.service.createAction()` - manual SUSPENSION | `vendor.enforcement_suspension` | human UUID |
| `vendor-enforcement.service.createAction()` - manual TERMINATION | `vendor.enforcement_termination` | human UUID |
| `vendor-enforcement.service.createAction()` - manual RESTRICTION | `vendor.enforcement_restriction` | human UUID |
| `vendor-enforcement.service.createAutomatedSuspension()` | `vendor.automated_suspension` | null + `metadata.system: true` |
| `vendor-enforcement.service.liftAction()` | `vendor.enforcement_lifted` | human UUID |

## Order status changes

| Path | Action | actorId |
|------|--------|---------|
| `admin-users.service.overrideOrderStatus()` (single) | `order.status_overridden` | admin UUID |
| `admin-users.service.bulkOverrideOrderStatus()` (per-order loop) | `order.status_overridden` | admin UUID |

## Actor convention
- Human actor: pass `actor.id` (UUID) as the dedicated `actorId` param; `issuedBy` (string, may be email) stays on the enforcement action row only.
- Automated/system: `actorId: null`, `metadata.system: true`. Consistent with payments/webhook pattern.

## Same-transaction rule
AuditLog.create() must be inside the Prisma `$transaction` callback. Any audit write outside the transaction is an evidence gap.

## Historical gap
Enforcement actions created before this change have no AuditLog rows. Not backfilled by design.

**Why:** Fabricating historical rows would misrepresent the audit trail. Regulators and dispute teams must be told explicitly that pre-change actions are unevidenced in the audit log.
