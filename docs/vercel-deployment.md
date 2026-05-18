# Vercel Deployment - Feastpot Frontends

Deploy `apps/web`, `apps/vendor`, `apps/admin` from the `feastpot-platform`
monorepo to Vercel. The API stays on Replit Autoscale at
`https://feastpot-platform.replit.app`.

---

## Pre-flight (already done in the repo)

- All three apps read the API URL from `process.env.NEXT_PUBLIC_API_URL`
  via `src/lib/env.ts`. No `next.config.mjs` hardcodes anything.
- The only `localhost` references are intentional dev fallbacks in
  `src/lib/env.ts` (used when `NEXT_PUBLIC_API_URL` is unset).
- `.env.example` in each app is the canonical list of Vercel env vars.

If you ever add a new `process.env.NEXT_PUBLIC_*` reference, also add it
to the relevant `.env.example` so this list stays accurate.

---

## 1. Environment variables (set per Vercel project)

### `apps/web` (customer PWA)

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `NEXT_PUBLIC_API_URL` | `https://feastpot-platform.replit.app` (then `https://api.feastpot.co.uk` once DNS is live) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe → Developers → API Keys |
| `NEXT_PUBLIC_SITE_URL` | `https://feastpot.co.uk` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Same value as on the API (Replit Secrets) |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | `support@feastpot.co.uk` |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP` | Real WhatsApp Business number |
| `NEXT_PUBLIC_ICO_NUMBER` | Real ICO registration number |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API Keys (server-only) |

### `apps/vendor` (vendor portal)

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `NEXT_PUBLIC_API_URL` | `https://api.feastpot.co.uk` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe → Developers → API Keys |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Same value as on the API |

### `apps/admin` (admin panel)

| Key | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `NEXT_PUBLIC_API_URL` | `https://api.feastpot.co.uk` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe → Developers → API Keys |

---

## 2. Create three Vercel projects

Repeat these steps for each of `apps/web`, `apps/vendor`, `apps/admin`.

1. **vercel.com → Add New Project → Import Git Repository →
   `feastpot-platform`**.
2. **Framework Preset**: Next.js (auto-detected).
3. **Root Directory**: `apps/web` (or `apps/vendor`, or `apps/admin`).
4. **Build Command** (override):
   - web:    `cd ../.. && npm run build --workspace=@feastpot/web`
   - vendor: `cd ../.. && npm run build --workspace=@feastpot/vendor`
   - admin:  `cd ../.. && npm run build --workspace=@feastpot/admin`
5. **Output Directory**: `.next` (default).
6. **Install Command**: `cd ../.. && npm ci`.
7. Paste the env vars from §1 into the project's **Environment Variables**
   panel (set them for *Production*, *Preview* and *Development* unless
   you want previews to point at a different API).
8. **Deploy**.

> Note on the build command. The brief uses `npm run build --filter=…`,
> which is Turborepo syntax - that only works if the install step has
> already pulled Turborepo. The `npm run build` script in the repo root
> already runs `turbo build`, so the safer form is
> `npm run build --workspace=@feastpot/<app>` (npm-native), which is
> what the table above uses.

---

## 3. Custom domains

After the first successful deploy, in **Project → Settings → Domains**:

| App | Domains to add |
| --- | --- |
| `apps/web` | `feastpot.co.uk` and `www.feastpot.co.uk` |
| `apps/vendor` | `vendor.feastpot.co.uk` |
| `apps/admin` | `admin.feastpot.co.uk` |

Vercel will show the CNAME (or A record) value for each. Copy them
exactly - the trailing dot matters.

---

## 4. Cloudflare DNS

For each subdomain in Cloudflare DNS:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| A | `@` (apex `feastpot.co.uk`) | `76.76.21.21` | DNS only (grey) |
| CNAME | `www` | `cname.vercel-dns.com.` | DNS only (grey) |
| CNAME | `vendor` | `cname.vercel-dns.com.` | DNS only (grey) |
| CNAME | `admin` | `cname.vercel-dns.com.` | DNS only (grey) |

**Critical**: keep the proxy **grey-cloud / DNS only**. Orange-cloud
(proxied) breaks Vercel's edge handshake and HTTPS issuance.

For the API host:

| Type | Name | Target | Proxy |
| --- | --- | --- | --- |
| CNAME | `api` | the Replit deployment hostname (from Replit → Deploy → Domains) | DNS only (grey) |

Until `api.feastpot.co.uk` is configured, set
`NEXT_PUBLIC_API_URL=https://feastpot-platform.replit.app` in Vercel
and update it once DNS is live.

---

## 5. Supabase Auth - redirect URLs

**Supabase dashboard → Authentication → URL Configuration**:

- **Site URL**: `https://feastpot.co.uk`
- **Redirect URLs** (add all three):
  - `https://feastpot.co.uk/auth/callback`
  - `https://vendor.feastpot.co.uk/auth/callback`
  - `https://admin.feastpot.co.uk/auth/callback`

Also keep `http://localhost:3000/auth/callback` etc. for local dev.

---

## 6. CORS (already done in the API)

`apps/api/src/main.ts` already allow-lists:

- `https://feastpot.co.uk`
- `https://vendor.feastpot.co.uk`
- `https://admin.feastpot.co.uk`
- `http://localhost:3000`

If you add a Vercel preview origin you want to allow during testing,
add it to `ALLOWED_ORIGINS` and re-deploy the API.

---

## 7. Post-deployment verification

1. `https://feastpot.co.uk` - homepage loads, no console errors,
   `/legal/{terms,privacy,allergens}` reachable, cookie banner shows on
   first visit.
2. `https://vendor.feastpot.co.uk/sign-in` - sign-in page renders.
3. `https://admin.feastpot.co.uk/sign-in` - sign-in page renders.
4. Sign in on each with the seeded users
   (`prisma/seed.ts`):
   - customer `grace@example.com` / `Feastpot!Cust1`
   - vendor   `maman@feastpot.co.uk` / `Feastpot!Vendor1`
   - admin    `soul@feastpot.co.uk` / `Feastpot!Admin1`
5. Place a test order on `feastpot.co.uk` end-to-end and confirm the
   request reaches the production API (Replit deployment logs).
6. Check **Vercel → Project → Deployments → … → Functions / Build
   Logs** for any errors.

---

## 8. Vercel Analytics & Speed Insights

In each project: **Analytics → Enable** and **Speed Insights → Enable**.
Both are free on Hobby and provide Core Web Vitals.

---

## 9. Things this guide deliberately does NOT do

- **Add `src/lib/api.ts`**. Every callsite already uses `src/lib/env.ts`.
  Adding a second client would either be dead code or force a sweep
  unrelated to deployment.
- **Change `next.config.mjs`**. None of the three configs hardcode an
  API URL.
- **Touch the API deployment**. The API stays on Replit Autoscale (see
  `IMPLEMENTATION_NOTES.md §1.1` for the port-mapping fix that was
  applied to make Autoscale healthy).
