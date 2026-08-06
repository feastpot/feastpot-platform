# Defect Log

_Items found outside the task scope during implementation. Each entry records
the file (or route) where the issue was noticed, the symptom, and any relevant
context. They are not fixed in the task that found them -- they should become
their own tasks or be addressed in a later pass._

---

## DEF-001 - /catering route does not exist

**Found during:** Task 1, Step 3 (primary navigation)
**Symptom:** `MarketingNav` links to `/catering`; the route returns 404.
**Resolution (Task 6):** `apps/web/src/app/catering/page.tsx` built as a
six-step enquiry funnel that POST to `/v1/catering-enquiries`. **FIXED.**

---

## DEF-002 - /trust route does not exist

**Found during:** Task 1, Step 3 (footer links)
**Symptom:** Footer links to `/trust` (Trust and safety); the route returns 404.
**Status:** Deferred. The `/trust` page is referenced in the sitemap and
robots.txt but has not been built yet. The footer link 404s cleanly.
**Action needed:** Build a `/trust` static content page covering FSA checks,
allergen disclosures, insurance requirements and the dispute process.

---

## DEF-003 - /vendor-readiness route does not exist

**Found during:** Task 1, Step 3 (footer links)
**Symptom:** Footer links to `/vendor-readiness`; the route returns 404.
**Resolution (Task 7):** `apps/web/src/app/vendor-readiness/page.tsx` built
with a seven-step readiness checklist, who-it-is-for section, disclaimer and
CTA to `/become-a-vendor`. **FIXED.**

---

## DEF-004 - Cuisine pill labels have no cuisine-slug mapping for generic dishes

**Found during:** Task 1, Step 4 (dead link sweep)
**Symptom:** Pills for "Small chops", "Fried plantain", "Egusi soup" etc. are
mapped to cuisine filters by best-guess; if the API adds a formal tag taxonomy
these slugs may diverge.
**Status:** Deferred. No formal tag taxonomy has been added. The pill mapping in
`favourites-pills.tsx` is documented as provisional.
**Action needed:** Confirm cuisine slug values with the backend team and align
the mapping table once a formal taxonomy is published.

---

## DEF-005 - Mobile navigation has no disclosure/hamburger menu for extra links

**Found during:** Task 1, Step 3 (primary navigation)
**Symptom:** The task asks for the desktop nav links to also appear in "the
existing mobile menu". No hamburger/disclosure menu exists; the bottom-nav
handles mobile navigation with four fixed tabs (Home, Browse, Orders, Account).
The new links (Occasions, Catering, Become a vendor) are therefore desktop-only
until a mobile menu is built.
**Status:** Deferred. Requires a new "More" tab or bottom-sheet menu.
**Action needed:** Design and build a mobile menu surface for secondary
navigation links.

---

## DEF-006 - Hardcoded testimonials in CommunityReviews are not verified orders

**Found during:** Task 3, Step 1 (review integrity fix)
**Symptom:** `CommunityReviews` contained four hardcoded quotes attributed to
named individuals with SE/SW/N postcodes. None mapped to real orders.
**Resolution (Task 3):** Component replaced by `VerifiedReviews` (async server
component) fetching from `GET /v1/reviews/featured`. If zero verified reviews
exist the component renders nothing. **FIXED.**

---

## DEF-008 - Radius filter has no default value or reset affordance

**Found during:** Task 4, Step 3 (filters audit)
**Status:** Deferred. The radius slider has no explicit default and no "reset"
button. Not blocking to MVP.
**Action needed:** Define a sensible default radius (e.g. 5 miles) and add a
reset affordance to the filter sidebar.

---

## DEF-009 - Sort-by dropdown is client-only with no URL persistence

**Found during:** Task 4, Step 3 (filters audit)
**Status:** Deferred. Sort selection is lost on refresh. The results page already
persists postcode and cuisine to the URL; sort should follow the same pattern.
**Action needed:** Persist sortBy to the URL query string alongside postcode and
cuisine filters.

---

## DEF-010 - Halal filter has no API backing

**Found during:** Task 4, Step 3 (filters audit)
**Symptom:** `halal=true` is passed to `SearchVendorsDto` but the repository
query has no corresponding filter logic.
**Status:** Deferred. Requires adding a `halal` boolean to `SearchVendorsDto`
and a corresponding `isHalal` column/flag on `Vendor`.
**Action needed:** Confirm halal status field in data model and wire it through.

---

## DEF-011 - Distance display needs the stored postcode from the previous search

**Found during:** Task 4, Step 3 (vendor card distance)
**Symptom:** VendorCard shows distance only when `distanceKm` is present in the
API response, which requires a `postcode` query param. On a refresh without
that param, distances are absent.
**Status:** Deferred. Distances are shown when the postcode is in the URL (the
normal search flow). A postcode-cookie fallback could improve this.
**Action needed:** Fall back to the coverage cookie postcode for distance
computation when no postcode query param is present.

---

## DEF-012 - Occasion grid uses static placeholder images

**Found during:** Task 3, Step 2 (occasion grid)
**Status:** Deferred. Occasion tiles use `/images/occasions/<slug>.jpg`
placeholders. No photography has been supplied yet.
**Action needed:** Commission or source occasion-specific photography and
replace placeholder paths.

---

## DEF-013 - Catering band CTA still links to /events (now /catering)

**Found during:** Task 3, Step 3 (catering band)
**Status:** Needs verification post Task 6 - the `/catering` route now exists.
**Action needed:** Confirm `catering-band.tsx` links to `/catering` not
`/events` and mark resolved.

---

## DEF-014 - Min-rating filter has no API backing

**Found during:** Task 4, Step 3 (filters audit)
**Symptom:** A minimum-rating filter was discussed. SearchVendorsDto has no
`minRating` param.
**Status:** Deferred.
**Action needed:** Add `minRating` to `SearchVendorsDto` and the repository query.

---

## DEF-015 - Pre-order available filter has no API backing

**Found during:** Task 4, Step 3 (filters audit)
**Status:** Deferred. No pre-order field exists on Vendor.
**Action needed:** Decide what "pre-order" means in the data model and expose
it as a filter.

---

## DEF-016 - Minimum order value filter has no API backing

**Found during:** Task 4, Step 3 (filters audit)
**Status:** Deferred. No `maxMinOrderPence` filter in `SearchVendorsDto`.
**Action needed:** Add a `maxMinOrderPence` filter to `SearchVendorsDto`.

---

## DEF-017 - Trust panel: "Typical order acceptance time" has no schema field

**Found during:** Task 5, Step 1 (trust panel)
**Symptom:** No `orderAcceptanceMins` field exists on Vendor or DeliveryConfig.
The row is omitted entirely from the trust panel.
**Status:** Deferred. Requires a schema change.
**Schema change needed:** Add `orderAcceptanceMins Int?` to the Vendor or
DeliveryConfig model.

---

## DEF-018 - Menu category: "Family pots" has no backing category key

**Found during:** Task 5, Step 2 (menu structure)
**Status:** Deferred. No `family_pots` category key in `MenuItem.category`.
**Schema change needed:** Add `family_pots` as a recognised `MenuItem.category`
value and re-tag relevant items.

---

## DEF-019 - Menu category: "Rice dishes" has no backing category key

**Found during:** Task 5, Step 2 (menu structure)
**Status:** Deferred. No `rice` or `rice_dishes` category key.
**Schema change needed:** Add `rice` or `rice_dishes` as a recognised
`MenuItem.category` value.

---

## DEF-020 - Menu category: "Sides" has no backing category key

**Found during:** Task 5, Step 2 (menu structure)
**Status:** Deferred.
**Schema change needed:** Add `sides` as a recognised `MenuItem.category` value.

---

## DEF-021 - Dish detail: no modal or route

**Found during:** Task 5, Step 3 (dish card / dish detail)
**Status:** Deferred. No dish detail view or modal exists. Large images and
per-dish delivery times are not displayed.
**Action needed:** Build a dish detail modal or route that shows the full image,
allergen list, preparation notes and delivery time estimate.

---

## DEF-022 - No delivery date selector in basket store

**Found during:** Task 5, Step 4 (basket)
**Status:** Deferred. Delivery date selection lives in checkout, not the basket.
Customers cannot see or change their delivery date until checkout.
**Action needed:** Consider exposing a date hint in the basket drawer so
customers confirm feasibility before starting checkout.
