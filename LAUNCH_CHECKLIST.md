# Feastpot — Pre-launch Checklist

A go-live gate covering the technical, legal, vendor, customer and monitoring
work that must be signed off before we publicly announce Feastpot. Treat each
unchecked box as a launch blocker unless explicitly waived in the launch
meeting notes.

_Status pass: 31 July 2026 — boxes ticked below were verified against the live
production API, the production database, or the current codebase on `main`.
Unchecked boxes are annotated: **HUMAN** = needs a person/account access to
verify or do; **GAP** = confirmed not done; **UNVERIFIED** = probably fine but
not yet checked. See `go-live-checklist.md` for the prioritised narrative._

---

## 1. Technical

### Infrastructure & deployment

- [x] Production Supabase project provisioned (UK/EU region) — dedicated London project `yeklvhoqanxnogjnhkui` live since 31 Jul; old shared project is dev-only; prod healthz confirms the ref. **Remaining HUMAN: confirm daily PITR/backup is enabled in the Supabase dashboard, and optionally set `REQUIRE_DEDICATED_SUPABASE=true` (would now pass).**
- [x] Production database has all migrations applied and history baselined (all 35 recorded clean, verified 30 Jul; deploys no-op).
- [x] Deployment for `@feastpot/api` is healthy (`/v1/healthz` returns `ok`) on `api.feastpot.co.uk`. _(Note: it's a Reserved VM, not Autoscale — required so queue workers + crons run in-process.)_
- [x] Vercel projects deployed for `apps/web`, `apps/vendor`, `apps/admin` — all three domains respond (verified 30 Jul).
- [x] DNS + HTTPS working on all four domains (implicitly verified — all serve over HTTPS).
- [ ] Cloudflare proxy disabled (DNS-only) for `api.feastpot.co.uk`. **HUMAN — check the Cloudflare dashboard.**
- [x] Production secrets present: healthz `secrets: ok`, Stripe `live`, email + WhatsApp configured, all 10 Twilio Content SIDs set (verified 30 Jul).
- [x] Redis provisioned (TLS, non-local — healthz `redisSecurity` green); Bull Board gated by basic auth (`admin` / `BULL_BOARD_PASSWORD`). **HUMAN — rotate the password if it predates launch.**

### Codebase quality

- [x] CI green on `main`: Lint, Typecheck, Test, Prisma validate, Build (last verified 31 Jul, PR #30).
- [x] Test coverage ≥ 70% for `@feastpot/api` — enforced in CI and passing.
- [x] Architect review completed for admin panel, payments and dispute flows (audit sections 1–9, complete 30 Jul; financial-integrity findings all closed).
- [x] All `TODO/FIXME` comments triaged — codebase sweep found zero markers (30 Jul).

### Performance & PWA

- [ ] Lighthouse mobile run on `feastpot.co.uk` ≥ 90/100/100/100. **HUMAN — run against production.**
- [ ] PWA installable on iOS Safari and Android Chrome; offline page reachable. **HUMAN — device test.**
- [ ] Service worker update flow confirmed with a forced re-deploy. **HUMAN.**
- [ ] `/sitemap.xml` correct and submitted to Google Search Console + Bing. **PARTIAL — the LIVE sitemap correctly uses `https://feastpot.co.uk` (verified 31 Jul; the localhost copies in the repo were just stale local-build artifacts, now gitignored). Remaining: HUMAN — submit to Search Console + Bing.**
- [x] `robots.txt` correct — live version verified 31 Jul: correct host/sitemap URLs, sensible Allow/Disallow rules.

### Security

- [ ] HoundDog / SAST scan green; dependency audit clean. **UNVERIFIED — re-run before announcement.**
- [x] Stripe live keys in production only — `resolveStripeEnv` selects LIVE/TEST by `NODE_ENV`; prod healthz confirms `stripe: "live"`.
- [ ] CORS allow-list locked to production origins. **UNVERIFIED — prod origins are present, but `localhost:3000/3002/3003` are also in the list in `apps/api/src/main.ts`; confirm that's acceptable or gate by env.**
- [x] Rate limits reviewed — Redis-backed ThrottlerModule with role-aware guard is in place.
- [ ] CSP and security headers verified via securityheaders.com (A or A+). **HUMAN — helmet is wired in the API; run the external scan on all four domains.**

---

## 2. Legal & compliance

- [ ] `/legal/terms` reviewed by counsel. **HUMAN.**
- [x] `/legal/privacy` published with the real ICO registration number (`ZC146267` in `legal-constants.ts` — placeholder removed).
- [ ] `/legal/allergens` icon rendering across iOS/Android/Windows. **HUMAN — device check; page is published.**
- [ ] Cookie banner displays on first visit and persists "accept". **UNVERIFIED — component exists (`cookie-banner.tsx`); browser-test the persistence.**
- [ ] DPAs signed with Stripe, Supabase, Twilio, Resend, Cloudflare R2. **HUMAN.**
- [ ] International transfer mechanism documented (UK IDTA / EU SCCs). **HUMAN.**
- [ ] DPIA completed and stored with the legal team. **HUMAN.**
- [x] Vendor terms separate from customer terms — both published (`/legal/vendor-terms` appears in Google results).
- [ ] Refund policy consistent across web, vendor portal and emails. **UNVERIFIED — spot-check the three surfaces.**

---

## 3. Vendor readiness

- [ ] Minimum 5+ verified vendors per launch borough. **HUMAN — operations.**
- [ ] Each launch vendor: FHRS ≥ 4, insurance, allergen training, Stripe Connect complete. **HUMAN — operations.**
- [ ] All launch vendors have 5+ published menu items with photos and allergen tags. **HUMAN — operations.**
- [ ] Vendor portal onboarding QA'd end-to-end with no dead ends. **HUMAN.**
- [ ] Sample payout cycle executed — funds settle, zero reconcile discrepancy. **HUMAN — the top remaining engineering-adjacent gate. First live run since the service-fee retention fix: verify the paid amount excludes the customer service fee. Procedure: `docs/runbooks/payout-dry-run.md`.**
- [ ] Vendor support runbook published. **HUMAN.**

---

## 4. Customer readiness

- [ ] Homepage rendering across iOS Safari / Android Chrome / desktop browsers. **HUMAN — device pass.**
- [x] SEO landing pages published (`/nigerian-food-delivery-london`, `/ghanaian-food-delivery-london`, `/caribbean-food-delivery-london` all exist in `apps/web`).
- [ ] `/help` FAQ live with current support email and WhatsApp number. **UNVERIFIED — page is live but falls back to hardcoded contacts (`+447459774818` / `support@feastpot.co.uk`) when `NEXT_PUBLIC_SUPPORT_*` env vars are unset; confirm these are the real launch contacts.**
- [ ] Test order flow E2E on production (postcode → checkout → delivery → review). **HUMAN — launch rehearsal.**
- [ ] Test refund flow E2E on production. **HUMAN — launch rehearsal.**
- [x] Transactional emails configured (Resend) — order confirmation, dispute, payout templates exist and prod healthz shows email configured.
- [ ] Cookie banner + privacy + terms links visible from every page. **UNVERIFIED — footer links exist; spot-check coverage.**
- [ ] App icons + Open Graph images render correctly when shared. **UNVERIFIED — OG images were rebranded to green on 30 Jul; after the Vercel deploy, re-test shares on WhatsApp/iMessage/LinkedIn and request Google re-indexing (task #74).**

---

## 5. Monitoring & observability

- [ ] Sentry projects for all four apps with release health. **UNVERIFIED — the API reports to Sentry (alerts fired historically); confirm the three frontends have DSNs set in Vercel.**
- [ ] `SENTRY_DSN` in production env for every app; synthetic error confirmed. **HUMAN.**
- [x] Deployment logs accessible to ops (Replit deployment log access verified in practice during the 30 Jul incident).
- [ ] BullMQ queue depth + DLQ alerts to PagerDuty/Slack. **PARTIAL — a DLQ monitor emails admins a daily digest; no pager/Slack integration. Related open tasks: failed-payout recovery and admin resend screen.**
- [x] Stripe webhook endpoint subscribed and verified — signing secret set, events flowing (dispute + transfer events observed in prod), handled-event allow-list kept in sync in code.
- [ ] Database alerts: connection saturation, slow queries. **HUMAN — configure in Supabase dashboard.**
- [x] Uptime monitoring live — it correctly caught the 30 Jul deploy outage within minutes.
- [ ] On-call rota documented. **HUMAN.**
- [x] Status page at `status.feastpot.co.uk` — live 4 Aug; subdomain root lands directly on the status page (backed by `/v1/statusz`), other paths redirect to www.

---

## Sign-off

| Area              | Owner | Date | Notes |
| ----------------- | ----- | ---- | ----- |
| Engineering       |       |      |       |
| Legal & Privacy   |       |      |       |
| Vendor Operations |       |      |       |
| Customer Support  |       |      |       |
| Marketing         |       |      |       |

Launch is **GO** only when every box above is ticked or explicitly waived by the
relevant owner with a documented mitigation plan.
