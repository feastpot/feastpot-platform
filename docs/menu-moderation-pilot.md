# Menu moderation pilot posture

## Decision

Feastpot uses manual menu-item approval for the pilot. `MENU_AUTO_APPROVE` is set to
`false`; an unset or malformed value also fails closed to manual review. The database
default is `held`, so direct writes cannot accidentally publish an auto-approved item.

This decision should be revisited when submission volume makes the 72-hour review target
consistently impractical. Until then, the small weekly review cost is justified by the
food-safety and listing-quality protection.

## Vendor experience

- New dishes and substantive edits enter `held` status.
- Vendors see that manual pilot approval is active and that the target turnaround is
  72 hours.
- Approved dishes can be made public only when availability is on and the allergen
  declaration is complete.
- Rejected dishes show the moderator's vendor-visible reason. Saving a correction
  submits the dish for review again.
- Approval and rejection decisions enqueue email and WhatsApp notifications.

## Staff operations

The Admin menu moderation queue defaults to pending items and shows submission age,
the 72-hour due time, and overdue status. Admins can approve, make a small edit and
approve, reject with a required vendor-visible reason, or bulk approve held items from
one vendor.

Bulk approval is an operator decision for a trusted vendor batch; it still refuses
cross-vendor IDs, non-held items, duplicates, and incomplete allergen declarations.

## Safety invariant

A dish is public only if all three conditions are true:

1. It is marked available.
2. Its moderation status is `approved` or explicitly opted-in `auto_approved`.
3. It declares at least one regulated allergen or explicitly confirms it is free from
   all 14.

The write path enforces the declaration before publication or approval, and public read
paths apply the same declaration predicate as defence in depth.

## WhatsApp launch dependency

The `menu_item_moderation_decision` WhatsApp template uses three slots:

1. Vendor first name.
2. Dish name.
3. Decision (`approved` or `rejected`).

Before launch, approve this template in the configured WhatsApp provider and set
`TWILIO_CONTENT_SID_menu_item_moderation_decision` when using Twilio. Email delivery and
the durable notification outbox do not depend on this provider-specific SID.
