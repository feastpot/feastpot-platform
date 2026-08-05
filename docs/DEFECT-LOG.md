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
