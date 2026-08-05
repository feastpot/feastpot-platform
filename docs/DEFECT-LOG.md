# Defect Log

_Items found outside the task scope during implementation. Each entry records
the file (or route) where the issue was noticed, the symptom, and any relevant
context. They are not fixed in the task that found them -- they should become
their own tasks or be addressed in a later pass._

---

## DEF-001 — /catering route does not exist

**Found during:** Task 1, Step 3 (primary navigation)
**Symptom:** `MarketingNav` links to `/catering`; the route returns 404.
**Context:** A catering/event enquiry page is referenced throughout the app
(marketing nav, footer). The page must be built before the nav link goes live
in production. Until then the link 404s cleanly (Next.js `not-found.tsx`).
**Action needed:** Build the `/catering` page (enquiry form that routes to the
events API at `POST /v1/events`).

---

## DEF-002 — /trust route does not exist

**Found during:** Task 1, Step 3 (footer links)
**Symptom:** Footer links to `/trust` (Trust and safety); the route returns 404.
**Action needed:** Build a `/trust` static content page covering FSA checks,
allergen disclosures, insurance requirements and dispute process.

---

## DEF-003 — /vendor-readiness route does not exist

**Found during:** Task 1, Step 3 (footer links)
**Symptom:** Footer links to `/vendor-readiness`; the route returns 404.
**Context:** Per task 1 instructions, the link is added now and will 404 until
task 7 builds the page.
**Action needed:** Build the `/vendor-readiness` page in task 7.

---

## DEF-004 — Cuisine pill labels have no cuisine-slug mapping for generic dishes

**Found during:** Task 1, Step 4 (dead link sweep)
**Symptom:** Pills for "Small chops", "Fried plantain", "Egusi soup" etc. are
mapped to cuisine filters by best-guess; if the API adds a formal tag taxonomy
these slugs may diverge.
**Action needed:** Confirm cuisine slug values with the backend team and
align the pill mapping table in `favourites-pills.tsx`.

---

## DEF-007 — /vendors skeleton persistence check (Task 4, Step 1)

**Found during:** Task 4, Step 1 (defect check)
**Finding:** The loading skeleton on /vendors is bounded and cannot persist
indefinitely. The `useVendors` hook is an infinite query with `retry: 3` and
exponential back-off (1s, 2s, 4s — capped at 10s). After three retries it
transitions to the error state ("Couldn't reach our kitchens" with a "Try again"
button). The Suspense fallback (grey skeleton boxes) only shows during SSR
hydration and resolves immediately. The `postcodeSyncResolved` gate means no
query fires until the postcode URL param is known, so no skeleton shows during
that tick. The page is a pure client component; `export const dynamic` is not
applicable.
**Action needed:** None — behaviour is acceptable.

---

## DEF-008 — Occasion filter in sidebar has no API backing

**Found during:** Task 4, Step 3 (filters audit)
**Symptom:** Sidebar offered Birthday / Sunday meal / Office lunch / Wedding
chips; these were written to `?occasion=` but SearchVendorsDto has no
`occasion` field, so no vendor was ever filtered. Removed in Task 4.
**Action needed:** Add an `occasion` filter to SearchVendorsDto and the vendor
search query when the data model supports it.

---

## DEF-009 — Delivery timing filter in sidebar has no API backing

**Found during:** Task 4, Step 3 (filters audit)
**Symptom:** Sidebar offered Tomorrow / This weekend / Schedule later chips;
written to `?delivery=` but SearchVendorsDto has no delivery-timing field.
Removed in Task 4. Actual slot availability lives in VendorCapacity (per
service date) and is not exposed as a list-level filter.
**Action needed:** Expose a date-range or next-available-slot filter in the
search endpoint when scheduling data is surfaced to the list layer.

---

## DEF-010 — Vegan and gluten-free dietary filters have no API backing

**Found during:** Task 4, Step 3 (filters audit)
**Symptom:** Sidebar offered Vegan and Gluten-free checkboxes; written to
`?dietary=` but SearchVendorsDto only has a `halal` boolean. Removed in
Task 4; only Halal remains as it is the sole dietary attribute indexed at the
vendor level.
**Action needed:** Add vegan/gluten-free flags to the Vendor model and
SearchVendorsDto when the data is collected during onboarding.

---

## DEF-011 — Delivery vs collection filter has no API backing

**Found during:** Task 4, Step 3 (filters audit)
**Symptom:** Task brief requested a "Delivery or collection" filter.
SearchVendorsDto.orderType is typed as the OrderType enum (standard / event /
subscription), not a delivery-vs-collection distinction. Vendor.orderTypes is
a String[] but is not exposed as a search filter. Not added.
**Action needed:** Add a deliveryType filter to SearchVendorsDto when the
delivery-config data layer is queryable at list level.

---

## DEF-012 — Serves band filter has no API backing

**Found during:** Task 4, Step 3 (filters audit)
**Symptom:** Task brief requested serves-band buckets (5-10, 10-20, 20-40,
40+). No guest-count or serves-count field exists on Vendor or in SearchVendorsDto.
VendorCapacity has capacityType but is per-date and not filterable at search.
Not added.
**Action needed:** Add a guest-count range filter to SearchVendorsDto once
capacity data is available at the vendor-profile level.

---

## DEF-013 — Hygiene evidence present filter has no API backing

**Found during:** Task 4, Step 3 (filters audit)
**Symptom:** Task brief requested a "hygiene evidence present" filter.
VendorTrustSignal stores hygiene_rating signals but SearchVendorsDto has no
trust-signal filter. Not added.
**Action needed:** Add a hasHygieneRating boolean filter to SearchVendorsDto.

---

## DEF-014 — Minimum rating filter has no API backing

**Found during:** Task 4, Step 3 (filters audit)
**Symptom:** Task brief requested a minimum-rating filter. SearchVendorsDto
has no minRating param. Not added.
**Action needed:** Add minRating to SearchVendorsDto and the repository query.

---

## DEF-015 — Pre-order available filter has no API backing

**Found during:** Task 4, Step 3 (filters audit)
**Symptom:** Task brief requested a "pre-order available" filter. No such
field exists on Vendor or in SearchVendorsDto. Not added.
**Action needed:** Decide what "pre-order" means in the data model and expose
it as a filter.

---

## DEF-016 — Minimum order value filter has no API backing

**Found during:** Task 4, Step 3 (filters audit)
**Symptom:** Task brief requested a minimum-order-value filter. SearchVendorsDto
has no maxMinOrderPence or similar param. Not added.
**Action needed:** Add a maxMinOrderPence filter to SearchVendorsDto.

---

## DEF-006 — Hardcoded testimonials in CommunityReviews are not verified orders

**Found during:** Task 3, Step 1 (review integrity fix)
**Symptom:** `CommunityReviews` (apps/web/src/components/home/community-reviews.tsx)
contained four hardcoded quotes attributed to named individuals with SE/SW/N
postcodes (e.g. "The egusi tasted exactly like home." — Grace, SE15). None of
these map to real orders in the database; the Review model was not queried.
**Resolution:** Component replaced by `VerifiedReviews` (async server component)
which fetches from `GET /v1/reviews/featured` (public endpoint, returns
auto_approved/approved, non-hidden reviews with a body). If zero verified
reviews exist the component renders nothing — `TrustStandard` immediately
below covers the trust messaging. The old hardcoded quotes are gone and cannot
silently reappear. `CommunityReviews` file retained but no longer imported.

---

## DEF-005 — Mobile navigation has no disclosure/hamburger menu for extra links

**Found during:** Task 1, Step 3 (primary navigation)
**Symptom:** The task asks for the desktop nav links to also appear in "the
existing mobile menu". No hamburger/disclosure menu exists; the bottom-nav
handles mobile navigation with four fixed tabs (Home, Browse, Orders, Account).
The new links (Occasions, Catering, Become a vendor) are therefore desktop-only
until a mobile menu is built.
**Action needed:** Consider adding a "More" tab or hamburger sheet to surface
secondary nav links on mobile.
