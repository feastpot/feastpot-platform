import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveProductionSupabaseUrl,
  normalizeEmail,
  parseArguments,
  resolveAuthUserLookup,
} from './provision-demo-vendor-access.mjs';

test('dry run defaults to read-only and does not require a recipient', () => {
  assert.deepEqual(parseArguments([]), {
    apply: false,
    confirmProduction: false,
    email: undefined,
  });
});

test('apply requires production confirmation and an email supplied on the command line', () => {
  assert.throws(() => parseArguments(['--apply']), /--apply --confirm-production/);
  assert.throws(
    () => parseArguments(['--apply', '--confirm-production']),
    /valid --email value/,
  );
  assert.deepEqual(
    parseArguments(['--apply', '--confirm-production', '--email', 'Demo.Owner@example.com']),
    {
      apply: true,
      confirmProduction: true,
      email: 'demo.owner@example.com',
    },
  );
});

test('production Auth URL is derived from Supabase direct host or pooler username', () => {
  assert.equal(
    deriveProductionSupabaseUrl(
      'postgresql://postgres:password@db.productionref.supabase.co:5432/postgres',
    ),
    'https://productionref.supabase.co',
  );
  assert.equal(
    deriveProductionSupabaseUrl(
      'postgresql://postgres.productionref:password@aws-0-eu-west-2.pooler.supabase.com:6543/postgres',
    ),
    'https://productionref.supabase.co',
  );
  assert.throws(
    () =>
      deriveProductionSupabaseUrl(
        'postgresql://postgres:password@localhost:5432/postgres',
      ),
    /must target db\./,
  );
});

test('email validation rejects whitespace and malformed domain values', () => {
  assert.throws(() => normalizeEmail('person @example.com'), /valid --email/);
  assert.throws(() => normalizeEmail('person@localhost'), /valid --email/);
  assert.equal(normalizeEmail(' PERSON@example.com '), 'person@example.com');
});

test('an explicit Auth user_not_found 404 is treated as missing only when DB also has no identity', () => {
  const lookup = {
    data: { user: null },
    error: { status: 404, code: 'user_not_found' },
  };
  assert.equal(resolveAuthUserLookup({ ...lookup, databaseIdentity: [] }), null);
  assert.throws(
    () => resolveAuthUserLookup({ ...lookup, databaseIdentity: [{ id: 'owner-id' }] }),
    /checks did not agree/,
  );
});

test('Auth lookup failures other than the agreed user_not_found 404 fail closed', () => {
  assert.throws(
    () =>
      resolveAuthUserLookup({
        data: { user: null },
        error: { status: 404, code: 'unexpected_error' },
        databaseIdentity: [],
      }),
    /Could not safely inspect/,
  );
  assert.throws(
    () =>
      resolveAuthUserLookup({
        data: { user: null },
        error: { status: 500, code: 'user_not_found' },
        databaseIdentity: [],
      }),
    /Could not safely inspect/,
  );
});