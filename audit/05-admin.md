# Phase 5: Admin application

Audited commit: `9c03ecad89f258adad72cb9e768d75b53b03d4eb`

## Authentication and route coverage

Admin route denominator: 49.

The targeted real-authentication setup created Admin, Support, Finance,
Compliance, Customer and Vendor identities and attempted to sign each in
through the production form.

The setup failed for a staff identity:

    Expected URL not to match /sign-in|unauthorized/
    Received:
    http://localhost:3003/unauthorized?reason=mfa-configuration

Evidence:

- Command output: `/tmp/feastpot-phase5-admin-targeted.out`
- Test source: `apps/admin/e2e/auth.setup.ts:21-62`
- Screenshot from the failed setup:
  `apps/admin/test-results/auth.setup.ts-provision-and-authenticate-every-staff-role-setup/test-failed-1.png`
- Current sign-in screenshot: `audit/evidence/admin-sign-in.jpg`

The sign-in screen visibly states "2FA required for staff access". The browser
result proves the current development MFA configuration prevents the test
staff account from entering the Admin application.

Because authentication failed, authenticated route coverage is 0/49. Fifteen
targeted compliance/legal workflow tests did not run. The isolated identities
were removed by the configured teardown, which passed in 51.4 seconds.

## Canonical route and role inventory

The destination-map test result:

    2 passed
    1 failed

The failure is deterministic:

    /platform-facts must be represented in ADMIN_DESTINATION_ROLES or
    explicitly excluded

Evidence:

- `apps/admin/e2e/admin-destination-map.spec.ts:47-59`
- `apps/admin/src/lib/admin-destinations.ts:10-77`

This means the canonical role inventory does not account for every Admin
filesystem route. The role matrix cannot provide complete proof while that
inventory is incomplete.

## Not verified

- All 49 authenticated Admin routes.
- Vendor application approve, reject and request-information actions.
- Required written reasons and notice timing for suspension/termination.
- Compliance review and expiry handling.
- Disputes and same-reviewer stage-two appeal rejection.
- Chargebacks, catering triage and assignment.
- Menu and review moderation.
- Payout batch execution and statement inspection.
- Commission-rate change notice enforcement.
- Legal operations and terms publication guards.
- Users, roles, audit log, discounts and push broadcast.
- Dead-letter and queue access.
- Sidebar and server enforcement for Admin, Support, Finance and Compliance.
- Percentages without denominators, zero-denominator "all clear" statements,
  raw UUIDs and test data mixed into operational views.

## Phase verdict

The current local Admin environment cannot admit its factory staff through the
declared MFA gate, and the canonical role map omits an existing route. The
Admin operational workflows are therefore not launch-verified.