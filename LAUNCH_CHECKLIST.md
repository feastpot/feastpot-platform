# Feastpot — Pre-launch Checklist

A go-live gate covering the technical, legal, vendor, customer and monitoring
work that must be signed off before we publicly announce Feastpot. Treat each
unchecked box as a launch blocker unless explicitly waived in the launch
meeting notes.

---

## 1. Technical

### Infrastructure & deployment
- [ ] Production Supabase project provisioned (UK/EU region) with daily PITR backup enabled.
- [ ] Production database has all migrations applied (`prisma migrate deploy`) and seed data sanity-checked.
- [ ] Replit Autoscale deployment for `@feastpot/api` is healthy (`/healthz` returns 200) on `api.feastpot.co.uk`.
- [ ] Vercel projects deployed for `apps/web` (`feastpot.co.uk`), `apps/vendor` (`vendor.feastpot.co.uk`) and `apps/admin` (`admin.feastpot.co.uk`) with custom domains verified.
- [ ] DNS A/CNAME + TXT records propagated; HTTPS certificates valid.
- [ ] Cloudflare proxy disabled (DNS-only, grey cloud) for `api.feastpot.co.uk` to avoid websocket/mTLS issues.
- [ ] Production secrets present in Replit + Vercel: see `.github/workflows/deploy.yml` header for the full list.
- [ ] Redis (queues) provisioned, accessible from API only, and BullMQ dashboard credentials rotated.

### Codebase quality
- [ ] `npm run ci` passes on `main` (lint, typecheck, test, build).
- [ ] Test coverage ≥ 70% for `@feastpot/api` (enforced in CI).
- [ ] Architect review completed for admin panel, payments and dispute flows; all critical findings closed.
- [ ] All `TODO/FIXME` comments triaged into the launch backlog or removed.

### Performance & PWA
- [ ] Lighthouse mobile run on `feastpot.co.uk` scores ≥ 90 Performance, 100 Accessibility, 100 Best Practices, 100 SEO.
- [ ] PWA installable on iOS Safari and Android Chrome; offline page reachable.
- [ ] Service worker `skipWaiting`/`clientsClaim` confirmed working with a forced re-deploy.
- [ ] `/sitemap.xml` reachable, includes vendor URLs, and submitted to Google Search Console + Bing Webmaster.
- [ ] `robots.txt` is correct (no inadvertent `Disallow: /`).

### Security
- [ ] HoundDog / SAST scan green; dependency audit shows no Critical or unresolved High issues.
- [ ] Stripe live keys in production only; test keys cannot reach prod.
- [ ] CORS allow-list locked to production origins (`feastpot.co.uk`, `vendor.feastpot.co.uk`, `admin.feastpot.co.uk`).
- [ ] Rate limits (`ThrottlerModule`) reviewed for auth, webhook and dispute endpoints.
- [ ] CSP and security headers (helmet) verified via securityheaders.com (A or A+).

---

## 2. Legal & compliance

- [ ] `/legal/terms` published with Last updated: May 2026; reviewed by counsel.
- [ ] `/legal/privacy` published; ICO registration number replaced (placeholder `ZA000000`).
- [ ] `/legal/allergens` published; allergen icons render on iOS, Android, Windows.
- [ ] Cookie banner displays on first visit and persists "accept" in localStorage.
- [ ] Data Processing Agreements (DPAs) signed with Stripe, Supabase, Twilio, Resend, Cloudflare R2.
- [ ] International transfer mechanism documented (UK IDTA / EU SCCs) for each non-UK processor.
- [ ] Data Protection Impact Assessment (DPIA) completed and stored with the legal team.
- [ ] Vendor terms separate from customer terms — both linked from the relevant onboarding flows.
- [ ] Refund policy (24h dispute window, 5-day refund) consistent across web, vendor portal and emails.

---

## 3. Vendor readiness

- [ ] Minimum **N** launch vendors verified per launch borough (target: 5+ each in Peckham, Tottenham, Brixton, Stratford).
- [ ] Each launch vendor has: FHRS rating ≥ 4, public liability insurance uploaded, allergen training certificate, completed Stripe Connect onboarding.
- [ ] All launch vendors have at least 5 published menu items with photos and allergen tags.
- [ ] Vendor portal walks through onboarding without dead ends (manually QA'd end-to-end).
- [ ] Sample payout cycle (Monday) executed against a test vendor — funds settle correctly and admin Stripe-reconcile shows zero discrepancy.
- [ ] Vendor support runbook published (escalation path, refund policy, dispute SLAs).

---

## 4. Customer readiness

- [ ] Homepage hero, postcode search and cuisine filter rendering correctly on iOS Safari, Android Chrome, desktop Chrome/Firefox/Safari.
- [ ] SEO landing pages (`/nigerian-food-delivery-london`, `/ghanaian-food-delivery-london`, `/caribbean-food-delivery-london`) published with vendor lists populated.
- [ ] `/help` FAQ live with current support email and WhatsApp number.
- [ ] Test order flow E2E: postcode → vendor → basket → Stripe checkout → confirmation email → push notification → delivery → review.
- [ ] Test refund flow E2E: customer raises dispute → admin resolves → refund hits test card.
- [ ] Marketing landing emails (Resend) configured: order confirmation, dispute resolved, payout summary (vendor).
- [ ] Cookie banner + privacy + terms links visible from every page.
- [ ] App icons + Open Graph images render correctly when shared on WhatsApp, iMessage, Twitter, LinkedIn.

---

## 5. Monitoring & observability

- [ ] Sentry projects created for `apps/api`, `apps/web`, `apps/vendor`, `apps/admin`; release health enabled.
- [ ] `SENTRY_DSN` set in production env for every app; first synthetic error confirmed in dashboard.
- [ ] Replit deployment logs accessible to ops; alerting configured for repeated `ERROR` lines.
- [ ] BullMQ queue depth + DLQ alerts configured (PagerDuty or Slack).
- [ ] Stripe webhook endpoint subscribed to: `payment_intent.succeeded`, `payment_intent.payment_failed`, `transfer.created`, `refund.updated`. Signing secret stored as `STRIPE_WEBHOOK_SECRET`.
- [ ] Database alerts: connection saturation, replication lag, slow queries (>1s) for all admin/dispute/payout endpoints.
- [ ] Uptime monitoring (e.g. Better Uptime, Cronitor) for `https://feastpot.co.uk`, `https://api.feastpot.co.uk/healthz`, `https://vendor.feastpot.co.uk`, `https://admin.feastpot.co.uk`.
- [ ] On-call rota documented with primary + secondary engineers; runbooks linked from Slack channel topic.
- [ ] Status page (e.g. statuspage.io / instatus) live at `status.feastpot.co.uk` with public component map.

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
