---
name: Vendor profile form
description: Key design decisions for the profile settings rewrite (Prompt 25)
---

## Featured dishes: IDs not strings
`vendors.featured_dishes` now stores **menu-item UUIDs**, not free-text names.
- `findBySlug()` resolves IDs to names via `menuItem.findMany` and attaches `featuredDishDetails: { id, name }[]` to the response.
- The web vendor page renders `featuredDishDetails.map(d => d.name)` with a fallback to the raw `featuredDishes` strings for legacy rows.
- The vendor portal form seeds `featuredItemIds` from `vendor.featuredDishes` (the raw IDs), then auto-heals by filtering against the live items list on load.
- Migration clears `featured_dishes` to `{}` (old free-text names cannot be auto-mapped to IDs).

**Why:** Allows auto-heal (filter IDs not in live items), prevents deleted/drafted dishes showing to customers, consistent validation in `update()`.

## Slug redirects
`vendor_slug_redirects` table: `id, vendor_id, old_slug, created_at`.
- Written by `repo.createSlugRedirect(vendorId, oldSlug)` (upsert-safe) inside `update()` before overwriting the slug.
- Public endpoint: `GET /vendors/slug-redirect/:slug` returns `{ newSlug }` or 404.
- Web vendor page: catches 404, calls `getVendorSlugRedirect(slug)`, calls `redirect()` if found.
- RLS: public SELECT allowed; writes go through service role only.

**Why:** Old QR codes and shared links keep resolving after a slug change.

## Social link normalisation
Done **client-side** in `profile-form.tsx` before sending to the API:
- Website field: must be a full URL.
- Other fields: accept `@handle`, bare handle, or full URL; normalised to canonical base URL on submit.
- API unchanged — it still validates that all social values are valid `http(s)` URLs.

## Profile form structure
- Two-column grid: left (imagery + identity), right (live preview + story + social).
- Full-width "What you cook" section: cuisines chip input, specialities chip input (max 12), featured dishes picker (max 6).
- Completeness check: gaps listed at top of form as amber banner (no percentages).
- Seed uses a `useRef` guard instead of `useState + useEffect` to avoid a double-render flash.
- Auto-heal effect reads `liveItems` after seed flag set; only triggers when liveItems loads.
