---
name: Catering booking line
description: Key schema and API invariants for the CateringBooking feature.
---

## Rules

**hygieneRegNumber lives on VendorApplication, not Vendor.**
Query `vendor.application { hygieneRegNumber }` not `vendor { hygieneRegNumber }`.

**Why:** The Vendor model has no hygiene reg field. It only appears on the VendorApplication row after an operator reviews the application.

**DocumentType enum values (prisma/schema.prisma)**
- `hygiene_cert` (not `hygiene_rating`)
- `kitchen_reg` (not `food_business_registration`)
- `insurance` (not `public_liability_insurance`)
Do not use snake_case variants from plain English names — read the enum block.

**VendorDocument has no `verifiedAt` field.** Use `reviewedAt` + `status === 'verified'` instead.

**CommissionService.resolveRateAndCompute takes 6 arguments:**
`(source, isFirstOrder, subtotalPence, totalPence, serviceFeePence, at: Date)`
Catering has no service fee, so pass 0 for serviceFeePence.

**AuthModule must be imported in any NestJS module that uses SupabaseAuthGuard.**
`SupabaseAuthGuard` depends on `SupabaseService` which is provided by `AuthModule`.
Even though many services are `@Global()`, `AuthModule` exports are not automatically visible to every module — it must be imported explicitly.

**How to apply:** Whenever creating a new NestJS module with routes protected by `@UseGuards(SupabaseAuthGuard)`, add `AuthModule` to its `imports` array.

## Deposit policy compatibility

Existing event quotes retain their historical percentage as a nullable legacy value; new and updated quotes use the 25% baseline plus a vendor cash minimum. Do not convert old 10–24% percentages into cash minimums because the new baseline would silently raise what customers owe.

**Why:** Preserving only the old percentage's calculated cash amount is insufficient: the new 25% baseline overrides that amount. The legacy path must also cap the deposit at the quote total so historical edge cases cannot overcharge.

**How to apply:** Keep legacy percentage handling in customer display, deposit collection, and final-balance calculation until all old quotes are closed. New quote writes must explicitly clear the legacy value.

## Migration applied
`prisma/migrations/20260806170000_add_catering_bookings/migration.sql` — applied to dev DB 2026-08-06.
Tables: `catering_bookings`, `catering_line_items`. Enum: `catering_booking_status`.
