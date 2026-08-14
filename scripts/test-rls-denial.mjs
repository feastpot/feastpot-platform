#!/usr/bin/env node
// RLS denial tests - run with the anon key, never the service key.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
//   node scripts/test-rls-denial.mjs
//
// In CI this script is run after migrate deploy so that the checks reflect
// the current schema. It skips with a warning when the env vars are absent
// (fork PRs, local runs without credentials). The job that wraps this script
// must fail when it exits non-zero.
//
// Why anon key only: service_role bypasses RLS entirely. A passing test that
// uses service_role proves nothing about PostgREST exposure.
//
// Two valid denial shapes:
//   HTTP 200 []   - schema USAGE granted, RLS is doing the deny
//   HTTP 401/403  - anon has no USAGE on public schema at all (stronger)
// Both are treated as correct for sensitive tables. The script detects which
// regime is in use and adjusts the governed-table assertions accordingly.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !ANON_KEY || !SUPABASE_URL.startsWith('https://')) {
  console.warn(
    '[rls-denial] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set ' +
    '(or URL is not a real Supabase project). Skipping RLS denial tests.'
  );
  process.exit(0);
}

const REST = `${SUPABASE_URL}/rest/v1`;

const headers = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  Accept: 'application/json',
  'Accept-Profile': 'public',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function get(table, params = '') {
  const url = `${REST}/${table}?select=*&limit=5${params ? '&' + params : ''}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

/** True when the response is a denied access in any form:
 *  - HTTP 200 with an empty array (schema USAGE exists, RLS blocks rows)
 *  - HTTP 401/403 with a "permission denied" error (no schema USAGE at all)
 * Both mean the client cannot read the data. */
function isDenied({ status, body }) {
  if (status === 200) return Array.isArray(body) && body.length === 0;
  if (status === 401 || status === 403) {
    const msg = typeof body === 'string' ? body : (body?.message ?? '');
    return msg.includes('permission denied');
  }
  return false;
}

const pass = [];
const fail = [];

function assert(name, condition, detail) {
  if (condition) {
    pass.push(name);
    console.log(`  PASS  ${name}`);
  } else {
    fail.push({ name, detail });
    console.error(`  FAIL  ${name} -- ${detail}`);
  }
}

// ---------------------------------------------------------------------------
// Probe: determine which denial regime this Supabase project uses.
// Use payouts as the probe table - it has RLS on, no policies, and never
// has a reason to grant anon access.
// ---------------------------------------------------------------------------

const probe = await get('payouts');
const schemaUsageExists =
  probe.status === 200 && Array.isArray(probe.body);
const noSchemaUsage =
  (probe.status === 401 || probe.status === 403) &&
  (probe.body?.message ?? '').includes('permission denied');

console.log(
  `\n[rls-denial] Regime: ${
    schemaUsageExists
      ? 'schema USAGE granted to anon - RLS is the only guard (HTTP 200 [])'
      : noSchemaUsage
      ? 'no schema USAGE for anon - schema-level block (HTTP 401/403), RLS is a defence-in-depth'
      : `unexpected probe result (status=${probe.status})`
  }\n`
);

if (!schemaUsageExists && !noSchemaUsage) {
  console.error(
    `[rls-denial] Unexpected probe result from payouts: status=${probe.status} body=${JSON.stringify(probe.body).slice(0, 120)}`
  );
  console.error('[rls-denial] Cannot determine denial regime. Aborting.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Part A: Tables that must be LOCKED (RLS on, no policies = deny all).
// Each of these contains sensitive data. Accept either denial shape.
// ---------------------------------------------------------------------------

console.log('[rls-denial] Part A: sensitive tables must be inaccessible to anon\n');

const sensitiveTablesThatMustBeLocked = [
  // Identity / compliance / HMRC
  { table: 'vendor_tax_profiles',        sensitivity: 'HMRC identity, DOB, tax identifiers, bank account IDs' },
  { table: 'vendor_verifications',       sensitivity: 'identity verification records' },
  { table: 'vendor_enforcement_actions', sensitivity: 'compliance enforcement records' },
  { table: 'dispute_appeals',            sensitivity: 'legal appeal records' },
  { table: 'platform_reports',           sensitivity: 'HMRC annual reports with gross payout figures' },
  // Financial
  { table: 'payouts',                    sensitivity: 'vendor payout amounts' },
  { table: 'order_commissions',          sensitivity: 'per-order commission figures' },
  { table: 'commission_rates',           sensitivity: 'platform commission rates' },
  { table: 'rate_schedule_entries',      sensitivity: 'commission schedule entries' },
  { table: 'payments',                   sensitivity: 'Stripe payment records' },
  { table: 'chargebacks',               sensitivity: 'chargeback records' },
  // Customer PII
  { table: 'addresses',                  sensitivity: 'customer delivery addresses' },
  { table: 'orders',                     sensitivity: 'order contents and customer details' },
  { table: 'order_items',               sensitivity: 'order line items' },
  { table: 'users',                      sensitivity: 'user accounts and roles' },
  // Attribution / analytics
  { table: 'order_attributions',         sensitivity: 'referral attribution records' },
  { table: 'referral_clicks',            sensitivity: 'click tracking records' },
  { table: 'analytics_events',           sensitivity: 'event stream with user identifiers' },
  // Vendor application (contains personal contact info)
  { table: 'vendor_applications',        sensitivity: 'vendor application PII' },
  { table: 'vendor_documents',           sensitivity: 'hygiene cert and insurance document references' },
];

for (const { table, sensitivity } of sensitiveTablesThatMustBeLocked) {
  const result = await get(table);
  assert(
    `anon SELECT ${table}`,
    isDenied(result),
    `expected denial (200 [] or 401/403 permission denied), got status=${result.status} body=${JSON.stringify(result.body).slice(0, 120)} [sensitivity: ${sensitivity}]`,
  );
}

// ---------------------------------------------------------------------------
// Part B: GOVERNED tables must still return the correct public subset to anon.
// Only meaningful when the project grants schema USAGE to anon; in projects
// that block at schema level, PostgREST returns 401 for everything and this
// section is skipped with a notice (both outcomes are safe).
// ---------------------------------------------------------------------------

console.log('\n[rls-denial] Part B: governed tables must respond 200 to anon\n');

if (!schemaUsageExists) {
  console.log(
    '  SKIP  (schema USAGE not granted to anon in this project - ' +
    'governed-table reachability cannot be tested here; ' +
    'run against the production Supabase project where USAGE is granted)\n'
  );
} else {
  for (const { table, params } of [
    { table: 'vendors',               params: 'status=eq.live' },
    { table: 'menus',                 params: '' },
    { table: 'menu_items',            params: '' },
    { table: 'vendor_slug_redirects', params: '' },
  ]) {
    const { status, body } = await get(table, params);
    assert(
      `anon SELECT ${table} (governed, must be reachable)`,
      status === 200 && Array.isArray(body),
      `expected HTTP 200 array, got status=${status} body=${JSON.stringify(body).slice(0, 80)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Part C: Cross-entity isolation - additional LOCKED tables.
// ---------------------------------------------------------------------------

console.log('\n[rls-denial] Part C: cross-entity isolation\n');

for (const table of ['vendor_members', 'terms_versions', 'terms_notices', 'terms_acceptances']) {
  const result = await get(table);
  assert(
    `anon SELECT ${table}`,
    isDenied(result),
    `expected denial (200 [] or 401/403), got status=${result.status} body=${JSON.stringify(result.body).slice(0, 80)}`,
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n[rls-denial] Results: ${pass.length} passed, ${fail.length} failed\n`);

if (fail.length > 0) {
  console.error('[rls-denial] FAILURES:');
  for (const { name, detail } of fail) {
    console.error(`  - ${name}: ${detail}`);
  }
  process.exit(1);
}

console.log('[rls-denial] All denial assertions passed.');
