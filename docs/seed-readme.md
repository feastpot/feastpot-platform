# Seed - testable dev world

## One-command boot + seed

```bash
# 1. Install dependencies (first run or after lockfile change)
npm ci

# 2. Start all four apps (each in a separate terminal, or use Replit workflows)
npm run dev --workspace=@feastpot/api      # :3001
npm run dev --workspace=@feastpot/web      # :3000
npm run dev --workspace=@feastpot/vendor   # :3002
npm run dev --workspace=@feastpot/admin    # :3003

# 3. Seed the dev database
npm run db:seed
```

`db:seed` is idempotent: re-running resets passwords, upserts vendors, and
rebuilds the order graph from scratch. It is safe to run against an already-
seeded database.

**Required env vars** (`.env`, see `.env.example`):
| Var | Purpose |
|---|---|
| `SUPABASE_URL` | Dev Supabase project API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (admin user creation) |
| `SUPABASE_DB_URL` | Prisma connection pool URL |
| `SUPABASE_DIRECT_URL` | Prisma direct URL (migrations) |

---

## Seeded accounts

All passwords follow the `Feastpot!<Role><N>` pattern and are reset on every
seed run.

### Staff (sign in via `/admin`)

| Email                       | Role       | Password            |
| --------------------------- | ---------- | ------------------- |
| `soul@feastpot.co.uk`       | admin      | `Feastpot!Admin1`   |
| `support@feastpot.co.uk`    | support    | `Feastpot!Support1` |
| `finance@feastpot.co.uk`    | finance    | `Feastpot!Finance1` |
| `compliance@feastpot.co.uk` | compliance | `Feastpot!Comp1`    |

### Vendor owners (sign in via `/vendor`)

| Email                              | Vendor                    | Password           |
| ---------------------------------- | ------------------------- | ------------------ |
| `maman@feastpot.co.uk`             | Maman's Kitchen (Peckham) | `Feastpot!Vendor1` |
| `chef.kwame@feastpot.co.uk`        | Kwame's Jollof (Brixton)  | `Feastpot!Vendor2` |
| `punjab.tandoor@feastpot.co.uk`    | Punjab Tandoor            | `Feastpot!Vendor3` |
| … (Vendor4–Vendor20, same pattern) | 17 more diaspora vendors  | `Feastpot!VendorN` |

### Vendor team member

| Email                    | Vendor          | Role            | Password         |
| ------------------------ | --------------- | --------------- | ---------------- |
| `jasmine@feastpot.co.uk` | Maman's Kitchen | kitchen_manager | `Feastpot!Team1` |

### Customers (sign in via `/`)

| Email               | Password         | Postcode | Notes                          |
| ------------------- | ---------------- | -------- | ------------------------------ |
| `grace@example.com` | `Feastpot!Cust1` | SE15 4QY | Inside Maman radius            |
| `david@example.com` | `Feastpot!Cust2` | SW9 8LF  | Inside Kwame radius            |
| `aisha@example.com` | `Feastpot!Cust3` | SE15 4DA | Inside Maman radius            |
| `omar@example.com`  | `Feastpot!Cust4` | E8 1LD   | Outside both radii (Hackney)   |
| `priya@example.com` | `Feastpot!Cust5` | N16 8JQ  | Borderline Maman radius        |
| `james@example.com` | `Feastpot!Cust6` | W2 4PP   | Outside both radii (Bayswater) |

---

## Seeded data summary

### Delivery service areas

| Vendor             | Type               | Radius            | Postcodes (approx)                                                         |
| ------------------ | ------------------ | ----------------- | -------------------------------------------------------------------------- |
| Maman's Kitchen    | local + collection | 8 mi from Peckham | SE1, SE4, SE5, SE15, SE16, SE17, SE22, SE23, SW9, BR1, E5 (overlaps Kwame) |
| Kwame's Jollof     | local + collection | 5 mi from Brixton | SW9, SW2, SW4, SE5, SE11, SE24, SE27 (overlaps Maman south-east)           |
| Extra vendors (18) | local + collection | 3–6 mi each       | Scattered across London; see `EXTRA_VENDORS` in `prisma/seed.ts`           |

Postcode search from **SE15** (Grace, Aisha) returns Maman + several extra
vendors. Search from **E8** (Omar) or **W2** (James) returns no primary
vendors - useful to distinguish a real "no coverage" result from a rendering
bug that makes all vendors invisible.

### Verification states

| Vendor          | State       | Notes                      |
| --------------- | ----------- | -------------------------- |
| Maman's Kitchen | VERIFIED    | All documents current      |
| Kwame's Jollof  | RENEWAL_DUE | Insurance expires Sep 2026 |
| Punjab Tandoor  | SUSPENDED   | Allergen training lapsed   |

### Founding allowance

Maman's Kitchen has `foundingAllowanceUsedPence = 45000` (£450 of £2,000
allowance consumed) so the partially-consumed state is visible in the admin
earnings view without needing to run real orders first.

### Discount codes

| Code      | Type       | Value | Funded by | Vendor restriction | Min order |
| --------- | ---------- | ----- | --------- | ------------------ | --------- |
| `FEAST10` | percentage | 10%   | PLATFORM  | None               | £0        |
| `MAMAN15` | flat       | £15   | VENDOR    | Maman's Kitchen    | £50       |

### Orders (8 total)

| #       | Customer | Vendor | Status              | Discount               |
| ------- | -------- | ------ | ------------------- | ---------------------- |
| FP-1001 | Grace    | Maman  | delivered           | -                      |
| FP-1002 | Grace    | Maman  | accepted            | -                      |
| FP-1003 | David    | Maman  | pending             | -                      |
| FP-1004 | David    | Kwame  | cancelled           | -                      |
| FP-1005 | Grace    | Maman  | delivered           | -                      |
| FP-1006 | Aisha    | Maman  | delivered           | FEAST10 (platform 10%) |
| FP-1007 | Omar     | Maman  | accepted            | MAMAN15 (vendor £15)   |
| FP-1008 | Priya    | Maman  | pending, collection | -                      |

---

## Payouts - actual route inventory

The runtime audit probe guessed `GET /v1/admin/payouts` - a path that was
**never registered**. The correct routes are:

| Method  | Path                                     | Controller          | Access                       |
| ------- | ---------------------------------------- | ------------------- | ---------------------------- |
| `GET`   | `/v1/payouts`                            | `PayoutsController` | admin, finance, vendor (own) |
| `GET`   | `/v1/payouts/summary`                    | `PayoutsController` | admin, finance, vendor       |
| `GET`   | `/v1/payouts/earnings-summary`           | `PayoutsController` | admin, finance, vendor       |
| `GET`   | `/v1/payouts/export.csv`                 | `PayoutsController` | admin, finance               |
| `GET`   | `/v1/payouts/orders/export.csv`          | `PayoutsController` | admin, finance               |
| `GET`   | `/v1/payouts/:id`                        | `PayoutsController` | admin, finance, vendor (own) |
| `GET`   | `/v1/payouts/:id/orders`                 | `PayoutsController` | admin, finance, vendor (own) |
| `POST`  | `/v1/payouts/:id/approve`                | `PayoutsController` | admin, finance               |
| `POST`  | `/v1/payouts/:id/reset`                  | `PayoutsController` | admin, finance               |
| `PATCH` | `/v1/payouts/:id/hold`                   | `PayoutsController` | admin, finance               |
| `POST`  | `/v1/admin/payouts/:id/reconcile-stripe` | `AdminController`   | admin, finance               |
| `POST`  | `/v1/admin/payouts/run-batch`            | `AdminController`   | admin, finance               |

The admin UI (`apps/admin/src/hooks/use-payouts.ts`) already calls
`GET /v1/payouts` - it has always used the correct path. No new endpoint
is needed; only the audit route inventory was wrong.
