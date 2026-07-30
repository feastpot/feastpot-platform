---
name: Order API responses have no DTO/serializer chokepoint
description: Customer-facing order responses are raw Prisma rows returned across several service methods — any new Order column leaks to customers by default.
---

# Order responses are raw Prisma rows (no DTO)

The orders module shapes responses with Prisma `include` (in the repository)
and returns the rows **untouched** from `OrdersService`. There is no response
DTO, no class-transformer `@Exclude`, and no customer-specific `select`. The
SAME query feeds customer, vendor, and admin callers.

**Why:** this means every scalar column on the `Order` model is exposed to
customers by default. An information-disclosure fix had to strip the internal
financial fields (`vendorPayoutPence`, `commissionPence`) via a shared
`stripInternalFinancials()` helper applied at EVERY customer return path —
not just one. The customer-facing return paths are spread across multiple
methods: `getById`, `list`, `createOrder` (`{order, clientSecret}`),
`customerCancel`, and `reorder` (delegates to `createOrder`).

**How to apply:** when adding any internal/sensitive column to the `Order`
model, assume it is customer-visible until you sanitize it. Route every
customer-facing order return through the single sanitizer helper rather than
adding ad-hoc omissions — and check ALL the return paths above, since there is
no single chokepoint. Vendor/admin paths (e.g. `updateStatus` transitions)
intentionally keep the fields.

**Update (Jul 2026):** staff-only order labels live in a separate `order_admin_tags` table (not a column on orders) precisely because of this — relations only appear when explicitly `include`d, so customer paths can't leak them. Follow this pattern for any future staff-only order metadata.
