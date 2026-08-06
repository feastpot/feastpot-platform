# Implementation Audit - apps/web

_Generated: 4 August 2026. Read-only survey of routes, shared components,
design tokens and API endpoints. No code was changed to produce this document._

---

## a. Routes in apps/web/src/app

| Route                             | Rendering              | What it renders                                                                                                                                                                                                       |
| --------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` (`page.tsx`)                  | Server (force-dynamic) | Homepage: MarketingNav · PostcodeHero · TrustIconStrip · OccasionGrid · HowFeastpotWorks · InstagramDmsBlock · CommunityReviews · FavouritesPills · FeastPassStrip. Vendor rails appear after postcode cookie is set. |
| `/vendors`                        | Client                 | Vendor search page: postcode banner, category chip rail, filter sidebar, paginated vendor cards. URL is the source of truth for all filters.                                                                          |
| `/vendors/[slug]`                 | Server (ISR 5 min)     | Vendor profile: hero image, menu tabs, availability, reviews. Falls back to 404 if slug not found.                                                                                                                    |
| `/checkout`                       | Client                 | Checkout flow: slot picker, address selector, basket summary, Stripe payment.                                                                                                                                         |
| `/orders`                         | Client                 | Signed-in user's order list (requires auth).                                                                                                                                                                          |
| `/orders/[id]/tracking`           | Client                 | Live order tracking timeline.                                                                                                                                                                                         |
| `/orders/[id]/confirmation`       | Client                 | Post-payment confirmation screen.                                                                                                                                                                                     |
| `/orders/[id]/review`             | Client                 | Post-delivery review form.                                                                                                                                                                                            |
| `/account`                        | Client                 | Account hub: profile, addresses, orders, notifications, loyalty/referral.                                                                                                                                             |
| `/account/profile`                | Client                 | Edit display name, phone, email preferences.                                                                                                                                                                          |
| `/account/addresses`              | Client                 | Saved addresses list.                                                                                                                                                                                                 |
| `/account/addresses/new`          | Client                 | Add address form.                                                                                                                                                                                                     |
| `/account/addresses/[id]/edit`    | Client                 | Edit address form.                                                                                                                                                                                                    |
| `/account/notifications`          | Client                 | Notification preference toggles.                                                                                                                                                                                      |
| `/account/orders`                 | Client                 | Paginated order history.                                                                                                                                                                                              |
| `/events`                         | Client                 | Catering event enquiries list.                                                                                                                                                                                        |
| `/events/new`                     | Client                 | New catering enquiry form.                                                                                                                                                                                            |
| `/events/[id]`                    | Client                 | Event detail / quote status.                                                                                                                                                                                          |
| `/events/[id]/confirmed`          | Client                 | Confirmed event screen.                                                                                                                                                                                               |
| `/occasions/[slug]`               | Static (8 slugs)       | Occasion landing pages (birthday, graduation, etc.) with postcode entry.                                                                                                                                              |
| `/help`                           | Server                 | Help & FAQ accordion - hardcoded copy + support contact fallbacks.                                                                                                                                                    |
| `/become-a-vendor`                | Server                 | Vendor acquisition page: pitch, commercials, how it works, interest form.                                                                                                                                             |
| `/(auth)/sign-in`                 | Client                 | Email/OTP sign-in form.                                                                                                                                                                                               |
| `/(auth)/sign-in/otp`             | Client                 | OTP entry screen.                                                                                                                                                                                                     |
| `/(auth)/register`                | Client                 | New-customer registration (name, phone).                                                                                                                                                                              |
| `/(auth)/register/create-account` | Client                 | Email + password step of registration.                                                                                                                                                                                |
| `/(auth)/forgot-password`         | Client                 | Password reset request form.                                                                                                                                                                                          |
| `/join`                           | Client                 | Referral landing page (reads `?ref=` param).                                                                                                                                                                          |
| `/waitlist`                       | Client                 | Postcode waitlist capture form.                                                                                                                                                                                       |
| `/legal`                          | Server                 | Legal index (links to sub-pages).                                                                                                                                                                                     |
| `/legal/terms`                    | Server                 | Terms of Service (static markdown-style).                                                                                                                                                                             |
| `/legal/privacy`                  | Server                 | Privacy Policy.                                                                                                                                                                                                       |
| `/legal/cookies`                  | Server                 | Cookie Policy.                                                                                                                                                                                                        |
| `/legal/allergens`                | Server                 | Allergen information.                                                                                                                                                                                                 |
| `/legal/vendor-terms`             | Server                 | Vendor Terms of Service.                                                                                                                                                                                              |
| `/nigerian-food-delivery-london`  | Server (ISR 1 hr)      | SEO cuisine landing - Nigerian food. CuisineLanding template.                                                                                                                                                         |
| `/ghanaian-food-delivery-london`  | Server (ISR 1 hr)      | SEO cuisine landing - Ghanaian food. CuisineLanding template.                                                                                                                                                         |
| `/caribbean-food-delivery-london` | Server (ISR 1 hr)      | SEO cuisine landing - Caribbean food. CuisineLanding template.                                                                                                                                                        |
| `/status`                         | Server                 | Platform status page backed by `/v1/statusz`.                                                                                                                                                                         |
| `/offline`                        | Static                 | PWA offline fallback.                                                                                                                                                                                                 |
| `not-found.tsx`                   | Static                 | Global 404 with back-home CTA.                                                                                                                                                                                        |
| `error.tsx`                       | Client                 | Global error boundary.                                                                                                                                                                                                |
| `global-error.tsx`                | Client                 | Root error boundary (wraps layout errors).                                                                                                                                                                            |

**Missing routes (noted but not built):**
`/catering`, `/trust`, `/vendor-readiness` - linked from nav/footer,
return 404. Logged in `docs/DEFECT-LOG.md` (DEF-001 to DEF-003).

---

## b. Shared UI components in apps/web/src/components

### Layout chrome

| Component       | Path                        | Purpose                                                                     |
| --------------- | --------------------------- | --------------------------------------------------------------------------- |
| `MarketingNav`  | `home/marketing-nav.tsx`    | Sticky top nav for homepage only; logo + text links + basket + account.     |
| `TopNav`        | `layout/top-nav.tsx`        | Inner-page header: back button + page title + bell + basket. Hidden on `/`. |
| `BottomNav`     | `layout/bottom-nav.tsx`     | Fixed mobile bottom nav: Home / Browse / Orders / Account (4 tabs).         |
| `Footer`        | `layout/footer.tsx`         | Vendor recruitment card + legal link grid + ICO line. Hidden on checkout.   |
| `BenefitsStrip` | `layout/benefits-strip.tsx` | 4-icon brand promise strip above the footer.                                |
| `PageShell`     | `layout/page-shell.tsx`     | Wrapper that applies `--page-safe-top/bottom` padding.                      |

### Homepage sections

`PostcodeHero`, `TrustIconStrip`, `OccasionGrid`, `HowFeastpotWorks`,
`InstagramDmsBlock`, `CommunityReviews`, `ReviewsMarquee`, `Testimonials`,
`FavouritesPills`, `FeastPassStrip`, `AnimatedHeadline`,
`CuisineFiltersSkeleton`, `HowItWorks`, `JoinFeastpotCta`.

### Vendor components

`VendorCard`, `VendorCardSkeleton`, `VendorRowCard`, `VendorFilterSheet`,
`CapacityBand`, `CapacityPill`, `CoverageBadge`, `TrustSignalBadge`,
`TrustSignalPanel`, `RatingBreakdown`, `ReviewsSection`,
`VendorResultsHeader`, `VendorResultsHero`, `VendorSearchBar`,
`VendorSearchInput`, `VendorFiltersSidebar`, `CategoryChips`, `CuisineFilter`,
`PostcodeChip`.

### Basket / checkout

`BasketDrawer`, `FloatingBasketBar`, `SlotPicker`, `PaymentRequestButton`.

### Account / orders

`Avatar`, `LoyaltyCard`, `ReferralCard`, `ReferralHistory`,
`AddressForm`, `AddressSelector`, `StatusTimeline`, `StarPicker`.

### SEO / occasions

`CuisineLanding` (shared template), `OccasionPostcodeForm`.

### Utility / infra

`CookieBanner`, `PushPermissionPrompt`, `SWUpdatePrompt`, `Wireframe`.

---

### Design tokens in use (exact values from tailwind.config.ts + globals.css)

**Colours (from `@feastpot/ui/brand`, extended into Tailwind):**

```
brand:       #00843d (green)  brand-light: #e6f4ec  brand-dark: #005c2b
scotch:      #e30613 (red)
plantain:    #f6b400 (gold)
charcoal:    #1c1c1a          charcoal-mid: #5f5e5a  charcoal-light: #9b9894
cream:       #fffdf7          cream-warm: #fff8e8    cream-deep: #f2ead3
teal:        #1d9e75          teal-light: #e1f5ee
pot:         #5f5e5a
yam:         #00843d (alias)
vendor:      (brand green alias for vendor-context chips)
surface:     #fffdf7
```

**shadcn/ui semantic tokens (HSL, defined in globals.css):**

```
--background: 40 33% 98%     --foreground: 60 4% 11%
--primary:    149 100% 26%   --primary-foreground: 0 0% 100%
--secondary:  44 100% 48%    --secondary-foreground: 0 0% 4%
--destructive: 356 95% 45%   --muted: 48 30% 94%
--accent:     149 60% 95%    --border: 48 30% 88%
--radius:     0.625rem
```

**Typography:**

```
font-sans:    var(--font-inter)      → Inter (self-hosted via next/font)
font-display: var(--font-playfair)  → Playfair Display (self-hosted)
```

**Border radius (extending Tailwind defaults):**

```
rounded-2xl: 1rem   rounded-3xl: 1.5rem   rounded-4xl: 2rem
rounded-lg: var(--radius) = 0.625rem
```

**Box shadows:**

```
shadow-card:    0 1px 4px rgba(28,28,26,.08), 0 4px 16px rgba(28,28,26,.04)
shadow-card-lg: 0 4px 24px rgba(28,28,26,.10)
shadow-sticky:  0 -2px 16px rgba(28,28,26,.08)
```

**Layout custom properties:**

```
--bottom-nav-height: 64px    --top-nav-height: 56px
--page-safe-bottom: calc(64px + env(safe-area-inset-bottom))
--page-safe-top:    calc(56px + env(safe-area-inset-top))
```

---

## c. Relevant API endpoints (apps/api)

| Method | Path                            | Purpose                                                                                                                     |
| ------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/vendors`                   | Vendor search by postcode, cuisine, category, sort. Params: `postcode`, `cuisine`, `q`, `halal`, `sortBy`, `limit`, `page`. |
| GET    | `/v1/vendors/coverage`          | Postcode districts served by vendors of given cuisines.                                                                     |
| GET    | `/v1/vendors/:slug`             | Vendor profile by slug. Optional `?postcode` for delivery check.                                                            |
| GET    | `/v1/vendors/:id/reviews`       | Published reviews for a vendor (public).                                                                                    |
| POST   | `/v1/vendors/register-interest` | Vendor application / interest form submission.                                                                              |
| POST   | `/v1/events`                    | Submit a catering event enquiry.                                                                                            |
| GET    | `/v1/events`                    | List customer's catering enquiries.                                                                                         |
| GET    | `/v1/events/:id`                | Event detail / quote.                                                                                                       |
| POST   | `/v1/waitlist`                  | Postcode waitlist capture.                                                                                                  |
| GET    | `/v1/allergens`                 | Allergen reference list.                                                                                                    |
| GET    | `/v1/statusz`                   | Minimal public health/status contract.                                                                                      |
| GET    | `/v1/healthz`                   | Full internal health check (DB, Redis, Stripe, Twilio, etc.).                                                               |

---

## d. Route existence check

| Route                                                 | Exists?                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `/catering`                                           | ❌ No - 404 (linked from nav and footer - DEF-001)                       |
| `/trust`                                              | ❌ No - 404 (linked from footer - DEF-002)                               |
| `/help`                                               | ✅                                                                       |
| `/vendors`                                            | ✅                                                                       |
| `/vendors/[slug]`                                     | ✅                                                                       |
| Dish detail route                                     | ❌ No - menu items have no dedicated URL; shown inline on vendor profile |
| Postcode waitlist capture (`/waitlist`)               | ✅                                                                       |
| Vendor recommendation / interest (`/become-a-vendor`) | ✅                                                                       |
| Occasion pages (`/occasions/[slug]`)                  | ✅ - 8 slugs statically generated                                        |
| `/catering` (event enquiry)                           | ❌ No - enquiry form at `/events/new` but no `/catering` route           |
| `/vendor-readiness`                                   | ❌ No - 404 (linked from footer - DEF-003)                               |
