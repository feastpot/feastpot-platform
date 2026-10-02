# Phase 0: Inventory

Audit started: 17 September 2026

## Commit

Command:

    git rev-parse HEAD

Output:

    9c03ecad89f258adad72cb9e768d75b53b03d4eb

`git status --short` reported only the user-supplied audit brief under
`attached_assets/`.

## Frontend route denominator

Command used for each application:

    find apps/<app>/src/app -type f -name 'page.tsx' | sort

Counts:

- Customer web: 50 routes
- Vendor portal: 45 routes
- Admin portal: 49 routes
- Total: 144 routes

### Customer web routes (50)

    /
    /account
    /account/addresses
    /account/addresses/[id]/edit
    /account/addresses/new
    /account/feastpass
    /account/notifications
    /account/orders
    /account/profile
    /auth/confirm
    /auth/reset/start
    /auth/reset/update
    /become-a-vendor
    /caribbean-food-delivery-london
    /catering
    /checkout
    /events
    /events/[id]
    /events/[id]/confirmed
    /events/new
    /feastpass
    /forgot-password
    /ghanaian-food-delivery-london
    /help
    /join
    /legal
    /legal/allergens
    /legal/cookies
    /legal/privacy
    /legal/terms
    /legal/vendor-terms
    /legal/vendor-terms/history
    /nigerian-food-delivery-london
    /occasions/[slug]
    /offline
    /orders
    /orders/[id]/confirmation
    /orders/[id]/review
    /orders/[id]/tracking
    /platform-facts
    /register
    /register/create-account
    /sign-in
    /sign-in/otp
    /status
    /trust
    /vendor-readiness
    /vendors
    /vendors/[slug]
    /waitlist

### Vendor routes (45)

    /
    /account-and-compliance
    /account-status
    /analytics
    /auth/reset/start
    /auth/reset/update
    /availability
    /catering
    /catering/[id]/quote
    /catering/new
    /compliance
    /disputes
    /disputes/[id]
    /earnings
    /events
    /events/[id]/quote
    /forgot-password
    /help
    /menu
    /menu/[menuId]
    /menu/[menuId]/items/[itemId]
    /menu/import
    /not-registered
    /notifications
    /onboarding
    /onboarding/register
    /onboarding/terms
    /onboarding/welcome
    /orders
    /orders/[id]
    /payouts
    /performance
    /platform-facts
    /referrals
    /settings/close-account
    /settings/delivery
    /settings/profile
    /settings/security
    /settings/team
    /share
    /sign-in
    /tax-information
    /terms
    /unauthorized
    /user-guide

### Admin routes (49)

    /
    /analytics
    /attribution
    /audit-log
    /catering
    /catering-bookings
    /catering-enquiries
    /chargebacks
    /commission-rates
    /compliance
    /coverage
    /dead-letters
    /discount-codes
    /disputes
    /disputes/[id]
    /error-incidents
    /events
    /events/[enquiryId]
    /feastpass-health
    /legal
    /legal/appeals
    /legal/coverage
    /legal/documents
    /legal/documents/[id]
    /legal/enforcement
    /legal/evidence
    /legal/notices
    /menus/queue
    /notifications
    /orders
    /payouts
    /platform-facts
    /push/compose
    /queues
    /reviews/queue
    /settings
    /settings/2fa
    /sign-in
    /supply-pipeline
    /unauthorized
    /user-guide
    /users
    /vendor-acquisition
    /vendor-applications
    /vendor-applications/[id]
    /vendor-recommendations
    /vendors
    /vendors/[id]
    /waitlist

## API endpoint denominator

Commands:

    find apps/api/src -type f -name '*.controller.ts' | sort
    rg -n '@(Controller|Get|Post|Put|Patch|Delete|Options|Head|All)\(' \
      apps/api/src --glob '*.controller.ts' | sort

The API has 43 controller files and 326 decorated request handlers:

- GET: 160
- POST: 116
- PUT: 6
- PATCH: 35
- DELETE: 9
- OPTIONS, HEAD and ALL: 0

The source-located endpoint inventory is the output of the second command. It
was captured during this phase. Endpoint route composition depends on both the
nearest `@Controller` decorator and each method decorator; later endpoint
testing must use Nest's configured global prefix and versioning.

## Running services

The platform workflow log snapshot confirmed all four configured services were
running without a restart:

- API: running
- Web: running, Next.js ready on port 3000
- Vendor: running, Next.js ready on port 3002
- Admin: running, Next.js ready on port 3003

## Phase 0 finding

### Notification delivery queue is already severely backed up

The API workflow log at 17 September 2026 11:20 showed:

    [notifications] breaching (failed=135 >= 25, waiting=254 >= 100)
    consecutive=184/2

The production deployment log showed the same sustained condition and also:

    Queue alert (no QUEUE_ALERT_SLACK_WEBHOOK_URL set)

It separately reported 12 failed compliance jobs and 8 failed terms-notice
jobs. This is a launch blocker candidate because customer, vendor, compliance
or legal notices may be delayed or permanently failed. The queue contents were
not replayed, discarded or otherwise changed.
