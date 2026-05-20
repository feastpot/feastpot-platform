# Vendor Portal - End-to-end smoke checklist (T012)

Run through this list against a fresh Supabase test account before each
release. Every step is a real action through the UI, not an API hit, so
the visual layer is exercised alongside the data path.

Brand check at every step: vendor blue primary, brand orange for money or
critical CTAs, amber for warnings, red for destructive, warm ivory
background. No em dashes anywhere in the copy you see on screen.

## 1. Onboarding
- [ ] Visit `/onboarding/register` while signed out. Form loads, no
      auth gate triggers.
- [ ] Submit the registration, follow the email link, land on the
      vendor portal `/onboarding`.
- [ ] Complete Stripe Connect handoff; status flips from `pending` to
      `live`.

## 2. Compliance (T001)
- [ ] Open `/compliance`. Empty state renders for a new vendor.
- [ ] Upload a Food Hygiene certificate. Status moves to `submitted`,
      then to `verified` after admin approval (verify via Admin app).
- [ ] Set the expiry to within 30 days; refresh `/` and `/compliance`.
      Amber "expiring soon" alert appears in both surfaces.
- [ ] Set the expiry into the past; refresh. Red "expired" alert
      appears in both surfaces.

## 3. Menu (T008)
- [ ] Open `/menu`. Create a menu and three menu items, one with
      photo, allergens and a price.
- [ ] Click "Duplicate" on a card. A `(copy)` item appears in
      unpublished state.
- [ ] Click "Preview". A new tab opens on the public vendor page.

## 4. Availability (T002)
- [ ] Open `/availability`. Set max orders/day = 5, max trays = 30,
      same-day off, large-order lead = 48h.
- [ ] Add a blackout date for tomorrow. From the customer web app,
      try to place an order for that date - slot is unavailable.

## 5. Business profile (T005)
- [ ] Open `/settings/profile`. Edit description, cuisines,
      specialities, vendor story, featured dishes, socials.
- [ ] Save. Reload the public vendor page; new content renders.

## 6. Order flow (T003, T004, T009)
- [ ] Place an order on the customer site against the test vendor.
- [ ] On the vendor `/`, the new order appears under "Due today" /
      "Upcoming". Notification bell shows badge.
- [ ] Open the kanban; click "Open order →" to land on
      `/orders/[id]`. Accept the order.
- [ ] Walk it through preparing → ready → dispatched → delivered.
- [ ] Click "Print" then "Download PDF" - the printable page has no
      chrome, contains customer + allergy + delivery info, and the
      browser print dialog offers Save as PDF.
- [ ] From a kanban card, the smaller "Print" link opens the detail
      page in a new tab and auto-launches the print dialog.

## 7. Payouts + CSV (T006)
- [ ] Trigger a payout cycle (Admin → Run batch). Vendor receives
      an inbox notification "Payout sent …".
- [ ] Open `/payouts`. Recent payout row appears.
- [ ] Click "Export CSV". File downloads, opens cleanly in Excel
      and Numbers, columns match the T006 spec.

## 8. Notifications (T007)
- [ ] Open `/notifications`. All recent events (order created,
      payout processed, compliance alerts) appear.
- [ ] Toggle "Unread" filter - only unread rows show.
- [ ] Click a row with a link - destination opens and the row is
      marked read; bell badge decrements.
- [ ] Hit "Mark all read" - every row dims and the badge clears.

## 9. Team + RBAC (T010)
- [ ] Open `/settings/team`. Invite three test accounts: one as
      `staff`, one as `finance`, one as `kitchen_manager`.
- [ ] Sign in as the `staff` account. `/payouts` shows the RBAC
      block; bell + orders accessible. `/menu` link is hidden in nav.
- [ ] Sign in as the `finance` account. `/menu` shows the RBAC
      block; `/payouts` is fully usable.
- [ ] Sign in as the `kitchen_manager` account. `/payouts` is
      blocked; menu editor is usable.
- [ ] Back as owner, change a member's role from the dropdown,
      remove a member, confirm row disappears.

## 10. 2FA (T011)
- [ ] Open `/settings/security`. Hit "Enable 2FA".
- [ ] Scan the QR with an authenticator, download recovery codes,
      enter the 6-digit code, hit Verify.
- [ ] Sign out, sign back in - Supabase prompts for the TOTP code.
- [ ] Return to `/settings/security`, hit Remove. 2FA is gone.

## 11. Final visual + copy pass
- [ ] grep the running pages: `rg -P "\x{2014}" apps/vendor/src` returns no hits.
- [ ] Spot check colours on Dashboard, Orders kanban, Payouts and
      Compliance pages - brand tokens applied, no stray off-palette
      hexes.
- [ ] Lighthouse a11y on `/`, `/orders`, `/menu` - no critical
      contrast or label issues.
