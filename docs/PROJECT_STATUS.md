# Feastpot - Editorial Status Report

_Last reviewed: 13 May 2026_

This is a plain-English read on where the platform actually stands today,
based on what is in the codebase right now (not what the roadmap says).
It is written to be read end-to-end by a non-engineer; the headline at the
top of each section tells you the verdict, the prose underneath explains it.

---

## TL;DR

Feastpot is in **late-beta shape**. The four apps - customer PWA, vendor
portal, admin panel, and the NestJS API behind them - are all wired
together end-to-end. A real customer can land on `feastpot.co.uk`, find a
vendor by postcode, fill a basket, pay with a real card, and watch the
order move through the vendor's kitchen on their phone. A real vendor can
sign up, pass compliance review, list a menu, take orders, and get paid
out via Stripe Connect. A real admin can moderate vendors, resolve
disputes, and watch background jobs.

What is **not yet ready** falls into three buckets: (1) customer
experience polish - most notably live map tracking, loyalty/referrals,
and discount codes; (2) operational tooling - admin "power user"
shortcuts and richer vendor analytics; and (3) the last mile of
production hardening - `api.feastpot.co.uk` DNS, notification provider
credentials, and uptime monitoring.

Nothing structural is missing. The remaining work is almost entirely
**filling in known slots**, not designing new ones.

---

## What's done, app by app

### The API (`apps/api`) - the engine room

This is the most mature part of the platform and deserves to be. The
**order lifecycle** is a real state machine - pending → accepted →
preparing → dispatched → delivered - with atomic compare-and-swap guards
so two requests can't move the same order twice. The **payment flow**
authorises the card when the order is placed, captures on delivery, and
refunds automatically when a dispute is upheld. The **catalogue** supports
multiple menus per vendor with allergen and dietary validation, and image
uploads land in Supabase Storage rather than the database. The
**dispute** workflow is the one most teams skip and it's fully here:
customer raises, vendor responds, support resolves, refund fires.
**Event enquiries** even include a Haversine distance match against each
vendor's delivery radius and a deposit-then-balance payment split.
**Compliance documents** upload, get verified, and a nightly cron warns
vendors before anything expires.

What's _partially_ there: **notifications** have the queue, the worker,
and the service layer in place, but the actual SMS/email providers
(Twilio, Resend) are stubbed out and need credentials before they'll
send anything to a real phone. What's _missing_: **order amendments**
(the controller literally throws `NotImplementedException` because it
needs a new database table), and the **loyalty / referral** logic - the
Prisma models are sitting there waiting, but no service consumes them
yet.

### The customer PWA (`apps/web`) - the storefront

The end-to-end purchase path works. **Postcode-driven discovery**,
cuisine-specific landing pages (Nigerian, Ghanaian, Caribbean) for SEO,
a **vendor-locked basket** that prevents you from accidentally mixing
two kitchens into one order, and a **Stripe Elements checkout** with
delivery-slot picking are all live. Account, orders, and the legal
suite (`/legal/privacy`, `/legal/cookies`, `/legal/vendor-terms`) are
in production and verified by the deploy-verifier script.

The most visible missing piece for customers is **live map tracking**.
Today the order page shows a static timeline; the map skeleton exists
but doesn't yet receive driver coordinates. **Reviews** post and display,
but the "verified purchase" badge depends on backend wiring that hasn't
been completed.

### The vendor portal (`apps/vendor`) - the kitchen

Vendor onboarding is one of the more complete journeys in the codebase:
multi-step Stripe Connect, document upload, profile completion. Once
live, vendors get a **real-time order dashboard** with audible alerts,
full **menu CRUD** including image management, and a working
**payouts** view. The **analytics** page shows real revenue and order
counts pulled from the API - what's not yet real is the "insights"
panel, which today is mostly placeholder copy where business
intelligence is meant to go.

### The admin panel (`apps/admin`) - the back office

Admins can run the platform with what's here. **Vendor moderation**
(approve, reject, request changes), **dispute resolution** with
evidence review and one-click refunds, **payouts**, and **BullBoard**
embedded for live job-queue inspection are all functional. The honest
gap is "power user" tooling - there's no quick way for support to edit
a single user record or surgically correct an order without going
through the API. Day-to-day work is fine; emergency repair work isn't.

---

## The platform underneath

**The Prisma schema** has 21 models and is doing real work - every
service-layer feature above maps to actual tables and migrations.
Two models (`LoyaltyPoint`, `Referral`) sit unused waiting for the
features above to be built. Two ideas (`OrderAmendment`, `DiscountCode`)
are referenced in API DTOs but **not yet in the schema** - they'll
need a migration before either feature can ship.

**The shared packages** are healthy. `@feastpot/types` distributes Zod
schemas and TypeScript interfaces so the API and the frontends can't
drift apart on a contract. `@feastpot/ui` is a real shadcn/Radix
component library used by all three frontends - no app re-implements
its own buttons or dialogs. `@feastpot/config` keeps tsconfig and
ESLint consistent.

**Tests** exist in `apps/api` as `.spec.ts` files for services and
guards, and CI enforces ≥70% coverage as a required PR check. Lint,
typecheck, Prisma-validate, and full build-of-all-apps are also
required before any PR can merge to `main`.

**Git and deploy hardening** (Task #8, just completed) is in place:
branch protection on `main` requires 5 CI checks plus an approving
review, force-push and branch deletion are blocked, and there's a
documented emergency push path with `scripts/git-sync.sh` plus a
`scripts/verify-deploy.sh` that probes the live site, the API, and
the branch-protection config in one command.

---

## What's left before launch

Pulled from `LAUNCH_CHECKLIST.md` and cross-referenced against what's
actually in the code:

**Infrastructure / DNS.** `api.feastpot.co.uk` is not yet pointing at
the Replit Autoscale deployment; the API is reachable today only via
its `feastpot-platform.replit.app` fallback URL. Cloudflare proxy
needs to stay grey-cloud (DNS-only) when the record is added, to
avoid breaking websockets. Uptime monitoring (Better Uptime / Cronitor)
needs to be pointed at the four production hostnames once DNS lands.

**Secrets and providers.** Stripe is on test keys; production keys
need rotation in Vercel and Replit. Supabase credentials are fine for
staging but should be reviewed before launch. Twilio (SMS) and Resend
(email) credentials need to be added - the notification queue is
already wired and waiting for them.

**Customer-facing gaps.** Live driver tracking on the order page,
loyalty points, referral codes, discount codes, order amendments
post-checkout, and "verified purchase" badges on reviews. None are
blockers for a soft launch, but at least loyalty/referrals will be
expected by the marketing team.

**Operations.** Vendor analytics "insights" need real logic instead
of placeholder copy. The admin panel could use a fast user/order
edit tool for support cases. Notification-provider failure handling
in the worker should be tightened before going live.

**Security follow-ups** (already filed as `#9`/`#10`/`#11`, currently
cancelled but worth revisiting before launch): patch the GitHub-flagged
dependency vulnerability, move agent pushes to a dedicated bot account
instead of an owner PAT, and require signed commits on `main`.

---

## How to read this in one sentence

If a customer landed on the site tomorrow and tried to order dinner,
**they would succeed** - and the vendor would get the order, cook it,
deliver it, and get paid. What we still owe them is a map showing
where the driver is, a loyalty card to bring them back, and a
production phone number that texts them when food is on the way.
