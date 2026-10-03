/**
 * Production rollout gate. Read-only by default; requires --apply to activate.
 * Never logs DB credentials, JWTs, user identities or raw psql diagnostics.
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const inspectionSql = `
  SELECT json_build_object(
    'staged', to_regprocedure('public.custom_access_token_hook_v2(jsonb)') IS NOT NULL,
    'authAdmin', EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin'),
    'databaseRole', public.custom_access_token_hook(
      '{"user_id":"00000000-0000-0000-0000-000000000000","claims":{"role":"authenticated"}}'::jsonb
    )->'claims'->>'role',
    'appRole', public.custom_access_token_hook(
      '{"user_id":"00000000-0000-0000-0000-000000000000","claims":{"role":"authenticated"}}'::jsonb
    )->'claims'->>'app_role',
    'privateBucket', EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'feastpot-documents' AND NOT public),
    'storageRls', (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.objects'::regclass)
  );
`;

function assessReadiness(health, inspection, databaseRef) {
  const blockers = [];
  if (health.checks?.supabase?.environment !== 'production')
    blockers.push('API_IS_NOT_ON_PRODUCTION_SUPABASE');
  if (!databaseRef || health.checks?.supabase?.ref !== databaseRef)
    blockers.push('API_AND_DATABASE_PROJECTS_DO_NOT_MATCH');
  if (health.checks?.database !== 'ok') blockers.push('API_DATABASE_NOT_HEALTHY');
  if (health.checks?.authTokenClaims !== 'app_role-v1') blockers.push('COMPATIBLE_API_NOT_LIVE');
  if (!inspection.staged) blockers.push('STAGED_HOOK_MIGRATION_NOT_APPLIED');
  if (!inspection.authAdmin) blockers.push('SUPABASE_AUTH_ADMIN_MISSING');
  if (!inspection.privateBucket || !inspection.storageRls)
    blockers.push('PRIVATE_STORAGE_BOUNDARY_NOT_INTACT');
  return {
    ready: blockers.length === 0,
    blockers,
    alreadyActive: inspection.databaseRole === 'authenticated' && inspection.appRole === 'customer',
  };
}

function connectionEnv(databaseUrl) {
  const database = new URL(databaseUrl);
  // PGDATABASE does not expand a URI supplied through the environment.
  // Override every libpq target field: Replit may export an unrelated PGHOST.
  const env = {
    ...process.env,
    PGHOST: database.hostname,
    PGPORT: database.port || '5432',
    PGUSER: decodeURIComponent(database.username),
    PGPASSWORD: decodeURIComponent(database.password),
    PGDATABASE: decodeURIComponent(database.pathname.slice(1)),
    PGSSLMODE: database.searchParams.get('sslmode') || 'require',
  };
  delete env.PGHOSTADDR;
  delete env.PGSERVICE;
  delete env.PGSERVICEFILE;
  return env;
}

function psql(databaseUrl, args, readOnly = true) {
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', ...args], {
    encoding: 'utf8',
    timeout: 30000,
    // Keep credentials out of argv/logs and isolate inherited libpq settings.
    env: {
      ...connectionEnv(databaseUrl),
      PGOPTIONS: `-c statement_timeout=20000 -c lock_timeout=5000${readOnly ? ' -c default_transaction_read_only=on' : ''}`,
    },
  });
  if (result.status !== 0 || result.error) throw new Error('PRODUCTION_DATABASE_COMMAND_FAILED');
  return result.stdout;
}

async function main(args = process.argv.slice(2)) {
  const apply = args.includes('--apply');
  const urlIndex = args.indexOf('--api-url');
  if (urlIndex < 0 || !args[urlIndex + 1])
    throw new Error('PASS_VERIFIED_PRODUCTION_API_URL_WITH_--api-url');
  const apiUrl = new URL(args[urlIndex + 1]);
  if (
    apiUrl.protocol !== 'https:' ||
    apiUrl.username ||
    apiUrl.password ||
    apiUrl.search ||
    apiUrl.hash
  )
    throw new Error('HTTPS_PRODUCTION_ORIGIN_REQUIRED');
  if (apiUrl.pathname !== '/') throw new Error('API_URL_MUST_BE_AN_ORIGIN');
  const databaseUrl = process.env.PROD_DIRECT_URL;
  if (!databaseUrl) throw new Error('PROD_DIRECT_URL_REQUIRED');
  const database = new URL(databaseUrl);
  const databaseRef = database.username.split('.')[1];
  if (!database.hostname.endsWith('.pooler.supabase.com') || database.port !== '5432')
    throw new Error('PRODUCTION_SESSION_POOLER_REQUIRED');
  const response = await fetch(new URL('/v1/health/z', apiUrl), {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) throw new Error('PRODUCTION_API_HEALTH_UNAVAILABLE');
  const body = await response.json();
  const health = body.data ?? body;
  // Reject a mismatched target before connecting to the database at all.
  if (
    health.checks?.supabase?.environment !== 'production' ||
    !databaseRef ||
    health.checks?.supabase?.ref !== databaseRef
  )
    throw new Error('PRODUCTION_API_AND_DATABASE_TARGET_MISMATCH');
  const inspection = JSON.parse(psql(databaseUrl, ['-A', '-t', '-c', inspectionSql]).trim());
  const readiness = assessReadiness(health, inspection, databaseRef);
  console.log(
    'STORAGE_HOOK_ROLLOUT',
    JSON.stringify({ mode: apply ? 'apply' : 'read-only', ...readiness }),
  );
  if (!readiness.ready) {
    if (apply) throw new Error('ACTIVATION_BLOCKED_NO_PRODUCTION_CHANGES');
    process.exitCode = 2;
    return;
  }
  if (!apply || readiness.alreadyActive) return;
  // Recheck the live API immediately before the transactional activation.
  const check = await fetch(new URL('/v1/health/z', apiUrl), {
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!check.ok) throw new Error('PRODUCTION_API_HEALTH_UNAVAILABLE');
  const checkBody = await check.json();
  const latest = assessReadiness(checkBody.data ?? checkBody, inspection, databaseRef);
  if (!latest.ready) throw new Error('API_READINESS_CHANGED_NO_PRODUCTION_CHANGES');
  psql(
    databaseUrl,
    ['--single-transaction', '-f', path.join(__dirname, 'activate-storage-auth-hook.sql')],
    false,
  );
  const after = JSON.parse(psql(databaseUrl, ['-A', '-t', '-c', inspectionSql]).trim());
  if (!assessReadiness(checkBody.data ?? checkBody, after, databaseRef).alreadyActive)
    throw new Error('POST_ACTIVATION_CONTRACT_CHECK_FAILED');
  console.log(
    'STORAGE_HOOK_ACTIVATED: refresh/reissue sessions, then verify authorised and denied downloads.',
  );
}

module.exports = { assessReadiness, connectionEnv, main };
if (require.main === module)
  main().catch((error) => {
    // Only our fixed classifications are printable; never echo arbitrary errors.
    const safe = /^[A-Z_0-9-]+$/.test(error.message) ? error.message : 'ROLLOUT_PREFLIGHT_FAILED';
    console.error(safe);
    process.exitCode = 1;
  });
