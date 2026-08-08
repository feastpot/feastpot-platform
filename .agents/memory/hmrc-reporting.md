---
name: HMRC reporting
description: Platform Operators Regulations 2023 (SI 2023/817) implementation - tax profiles, annual reports, crons, vendor gate.
---

## Rule
HMRC compliance is implemented in `VendorTaxProfileModule` (not a global module). Every vendor must have a complete tax profile before going live.

## Models
- `VendorTaxProfile` — `@@map("vendor_tax_profiles")`, UUID pk, one-to-one with Vendor
- `PlatformReport` — `@@map("platform_reports")`, UUID pk, `@@unique([reportingYear, vendorId])`
- Migration: `20260808190000_hmrc_tax_profiles`

## Vendor listing gate
`vendors.service.ts updateStatus()` checks `isTaxProfileComplete(taxProfile)` (direct Prisma query, no circular import) before any `→ live` transition. Throws `TAX_PROFILE_INCOMPLETE` if the profile is absent or missing required fields.

## isTaxProfileComplete()
Exported function from `vendor-tax-profile.service.ts`. Required fields: `entityType`, `legalName`, `addressLine1`, `city`, `postcode`; plus `dateOfBirth` for SOLE_TRADER, `companyNumber` for LIMITED_COMPANY.

## Crons (HMRC_QUEUE, separate from COMPLIANCE_QUEUE)
- Jan 3 09:00: `hmrc-annual-report` — generates PlatformReport rows for prior year
- Jan 5 09:00: `hmrc-send-copies` — emails vendor copies
- Jan 15 09:00: `hmrc-deadline-alert` — alerts founder, 16 days before 31 Jan

## Notification templates
`hmrc_copy_sent`, `hmrc_deadline_alert`, `hmrc_verification_failed` — email only.

**Why:**
- HMRC queue is separate to avoid adding unrelated @Process handlers to the compliance processor.
- Direct Prisma query in the gate (not service injection) avoids circular module import since VendorTaxProfileModule is not @Global.
- Stripe prefill only fills null columns, never overwrites verified data.
- Deadline alert fires Jan 15 (16 days before 31 Jan) — time to act.
