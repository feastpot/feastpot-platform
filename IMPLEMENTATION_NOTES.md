# Feastpot — Implementation Notes

A running editorial record of what has been built into the Feastpot monorepo,
written for engineers, ops and operators joining the project mid-flight.
Newest work appears at the top of each section.

---

## 1. Customer PWA (`apps/web`) — SEO, Legal & Cookie Consent

The customer app shipped with auth, basket, vendor browse and checkout flows.
This phase added the public/marketing surface area required for a UK launch.

### 1.1 Sitemap & robots
- Installed [`next-sitemap`](https://github.com/iamvishnusankar/next-sitemap)
  as a dev/build-time helper.
- `apps/web/next-sitemap.config.js` generates both `sitemap.xml` and
  `robots.txt`. It excludes the authenticated surface (`/account/*`,
  `/checkout`, `/orders/*`, `/auth/*`, `/(auth)/*`, `/offline`).
- `additionalPaths()` enriches the sitemap with **live vendor URLs** by
  hitting `GET /v1/vendors?status=live&limit=1000` at build time. The fetch
  is bounded by a 15 s `AbortSignal.timeout`, and any failure falls back to
  the static route list — we'd rather ship a smaller sitemap than break a
  deploy.
- Wired into the build via a `postbuild` script in
  `apps/web/package.json` (`next-sitemap --config next-sitemap.config.js`),
  so it runs automatically after every `next build`.

### 1.2 Global metadata (`apps/web/src/app/layout.tsx`)
- `metadataBase` is driven by `NEXT_PUBLIC_SITE_URL` and falls back to
  `https://feastpot.co.uk` so all relative OG/canonical URLs resolve in dev
  and prod.
- Title template: `%s | Feastpot`; default title:
  *Feastpot — African & Caribbean Food Delivered*.
- OG tags: `type=website`, `siteName=Feastpot`, `locale=en_GB`,
  `og-image.png` (1200×630 — must be uploaded to `apps/web/public/` before
  launch).
- Twitter card: `summary_large_image`, handle `@feastpot`.
- `robots: { index: true, follow: true }` (we want to be indexed).
- Existing PWA manifest, app icons, themeColor and viewport are preserved.

### 1.3 Cookie banner
- New client component: `apps/web/src/components/cookie-banner.tsx`.
- Mounted in the root layout inside the toast/query providers so it appears
  on every route.
- Persists user acceptance in `localStorage` under key
  `feastpot.cookie-consent.v1`. Versioned key — bump it if the cookie set
  ever changes materially.
- SSR-safe: renders `null` until the `useEffect` reads `localStorage` to
  avoid hydration mismatches.
- Copy: *“We use cookies for essential platform functionality. No
  advertising cookies.”* Links to `/legal/privacy`. Single **Accept**
  button — Feastpot only sets strictly-necessary cookies (auth session,
  CSRF, basket), which under PECR do not require prior opt-in.

### 1.4 Cuisine SEO landing pages
Three diaspora-cuisine landing pages targeting London search intent. They
share a single server-component template so copy stays consistent:

- `apps/web/src/components/seo/cuisine-landing.tsx` (shared template).
- `app/nigerian-food-delivery-london/page.tsx`.
- `app/ghanaian-food-delivery-london/page.tsx`.
- `app/caribbean-food-delivery-london/page.tsx`.

Each page contributes:
- Per-page `metadata` export (title, description, canonical, OG).
- An H1 and lead paragraph tuned for the cuisine.
- Six dish/section highlights (e.g. Jollof, Egusi… for Nigerian).
- A live vendor list filtered via `searchVendors({ cuisine, sortBy:'rating',
  limit: 12 })`, cached for 1 hour (`next: { revalidate: 3600 }`). The
  Caribbean page passes `['Caribbean', 'Jamaican', 'Trinidadian']` to
  match how vendors tag themselves.
- A “How Feastpot works” explainer.
- Three pre-written London customer reviews.
- A 4-question FAQ (delivery area, lead time, halal/event coverage,
  refunds).
- A brand-coloured CTA back to the homepage postcode flow.

If the API call fails the page still renders, just with a friendly “we’re
onboarding new vendors” message instead of a list — no 500s.

### 1.5 Legal pages
All three pages live under `/legal/*` and link from the cookie banner,
allergen page and footer surfaces.

- **`/legal/terms`** (`app/legal/terms/page.tsx`):
  - Platform-operator framing (Feastpot is not a food business).
  - Vendor obligations under Food Safety Act 1990, FIR 2014, Natasha’s Law,
    FHRS registration.
  - Customer rights & **24 h dispute / 5 business-day refund** SLA.
  - **12 % platform commission** on order subtotal, deducted at payout.
  - Vendor payouts run **weekly, every Monday**, via Stripe Connect.
  - Prohibited content/conduct (alcohol w/o licence, allergen
    misrepresentation, off-platform circumvention).
  - Limitation of liability and 12-month cap.
  - Governing law: **England and Wales**.
  - Last updated: **May 2026**.

- **`/legal/privacy`** (`app/legal/privacy/page.tsx`):
  - UK GDPR. Data controller: Feastpot Ltd, ICO registration `ZA000000`
    (placeholder — must be replaced before launch).
  - Data categories (account, delivery, orders, payment refs, comms,
    technical).
  - Lawful bases: contract, legitimate interest, legal obligation,
    consent.
  - Sharing: vendors (per-order), Stripe, Supabase, Twilio, Resend, plus
    legally-compelled disclosure.
  - International transfers protected by UK IDTA / EU SCCs.
  - Retention: orders & tax records 6 y, audit logs 6 y, account data
    until deletion or 24 m inactivity, marketing consent records until
    withdrawn + 12 m.
  - Full subject rights (access, rectification, erasure, portability,
    objection, withdrawal of consent), and link to lodge an ICO complaint.
  - Cookies clarified as essential-only.
  - Contact: `privacy@feastpot.co.uk`.

- **`/legal/allergens`** (`app/legal/allergens/page.tsx`):
  - All **14 FSA major allergens** rendered as an emoji-labelled responsive
    grid (no extra dependencies).
  - Prominent disclaimer that allergen data is vendor-provided and not
    independently verified.
  - Walk-through of the in-app allergen filter (search filters → toggle →
    optional account default).
  - Allergic-reaction guidance with a **999 escalation** for severe cases.
  - Outbound link to FSA guidance.

### 1.6 Help centre
- `apps/web/src/app/help/page.tsx` — a single FAQ page, no extra routing.
- Five sections (Ordering, Delivery, Refunds, Allergens, Vendor accounts)
  rendered as `dl/dt/dd` so it lands cleanly in screen readers.
- Prominent contact card: `support@feastpot.co.uk` (24 h reply, 7 days)
  and a placeholder WhatsApp number `+44 7000 000000` (replace before
  launch).
- Brand-coloured CTA to `/orders` for raising a dispute.

### 1.7 Pre-launch checklist
- `LAUNCH_CHECKLIST.md` at the repo root.
- Five sections — Technical, Legal, Vendor readiness, Customer readiness,
  Monitoring — covering Supabase/Vercel/Replit deploy targets, secrets,
  Lighthouse scores, PWA installability, sitemap submission, security
  scans, DPAs, cookie banner, vendor onboarding minimums, payout dry-run,
  Sentry/Stripe webhooks/uptime monitors and an on-call rota.
- A sign-off matrix at the bottom forces explicit ownership for each area
  (Engineering, Legal, Vendor Ops, Customer Support, Marketing) before
  launch is declared GO.

### 1.8 Verification
- `npm run typecheck -w @feastpot/web` is clean after all changes.
- No new dependencies beyond `next-sitemap`. Cookie banner reuses the
  existing `Button` from `@feastpot/ui` (`size="sm"`).
- All new pages are server components except the cookie banner (which has
  to be a client component to read `localStorage`).

### 1.9 Known launch blockers (flagged, not fixed)
- ICO registration number on the privacy page is the placeholder
  `ZA000000`.
- WhatsApp support number on the help page is the placeholder
  `+44 7000 000000`.
- `apps/web/public/og-image.png` (1200×630) must be uploaded — currently
  the metadata references it but the file doesn’t exist yet.

---

## 2. Earlier milestones (summary)

These were delivered in prior sessions and remain in place; full detail
lives in their PRs and module READMEs.

### 2.1 Admin panel (`apps/admin`, port 3003)
- Backend `AdminModule` with dashboard metrics, audit log + CSV stream,
  compliance expiry, vendor approval queue, payout reconcile-with-Stripe,
  and `assignedToId` filter on disputes. All routes role-gated to
  `admin | support | finance | compliance` (per-route narrowing).
- Next 15 admin app mirroring the vendor portal layout — sign-in,
  dashboard, vendors list + detail (with document review), disputes list +
  detail (3-column), payouts (batch approve + per-row hold + Stripe
  reconcile), compliance expiry table, audit log with CSV download.
- Architect review completed and findings closed.

### 2.2 CI / CD
- `.github/workflows/ci.yml` (lint + typecheck + test + build for every
  PR), `deploy.yml`, `neon-branch.yml`, and Dependabot config.

### 2.3 Production hardening
- API: Sentry instrumentation (`instrument.ts`), `trustProxy` for the
  Replit edge, `SentryGlobalFilter`, `build:api`/`start:api` scripts, and
  the `.replit` deployment block updated via `deployConfig`.

---

## 3. Conventions worth knowing

- **Brand tokens** live in `apps/web/src/app/globals.css` (mirroring
  `packages/ui/src/theme.css`) — `bg-brand` (#E8520A), `bg-teal`
  (#1D9E75), `bg-vendor` (#185FA5). Don’t add a fourth — extend an
  existing one.
- **Supabase auth** in `apps/web` uses `getUser()` (NOT `getSession()`)
  in middleware so the session is always re-validated server-side.
- **TanStack Query defaults**: `staleTime 60s`, `retry 1`, devtools only
  in dev.
- **Basket** is a zustand store persisted under `feastpot.basket.v1`;
  cross-vendor adds throw `CrossVendorBasketError`.
- **PWA** is powered by `@ducanh2912/next-pwa` (the maintained fork — do
  NOT switch to `next-pwa`, it breaks on Next 15).

---

_Last updated: May 2026._
