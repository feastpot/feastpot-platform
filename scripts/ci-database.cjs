const { appendFileSync } = require('node:fs');

function parseUrl(value, label) {
  try {
    return new URL(value);
  } catch {
    // URL parser errors can include the credential-bearing input.
    throw new Error(`CI_DATABASE_INVALID_${label}`);
  }
}

function prepareDatabase(environment, mode) {
  if (!['customer', 'rls'].includes(mode)) throw new Error('CI_DATABASE_INVALID_MODE');
  const allowedRef = environment.CUSTOMER_E2E_ALLOWED_SUPABASE_REF;
  if (!allowedRef || allowedRef === 'yeklvhoqanxnogjnhkui') {
    throw new Error('CI_DATABASE_DEVELOPMENT_PROJECT_REQUIRED');
  }
  if (!environment.SUPABASE_DB_URL) throw new Error('CI_DATABASE_TEST_URL_REQUIRED');
  const database = parseUrl(environment.SUPABASE_DB_URL, 'TEST_URL');
  const publicUrl = parseUrl(environment.NEXT_PUBLIC_SUPABASE_URL, 'PUBLIC_URL');
  for (const parameter of ['host', 'hostaddr', 'port', 'user', 'password', 'dbname', 'service']) {
    if (database.searchParams.has(parameter)) {
      throw new Error('CI_DATABASE_TARGET_OVERRIDE_REJECTED');
    }
  }
  const directHost = database.hostname === `db.${allowedRef}.supabase.co`;
  const poolerHost =
    database.hostname.endsWith('.pooler.supabase.com') &&
    decodeURIComponent(database.username) === `postgres.${allowedRef}`;
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    (!directHost && !poolerHost) ||
    publicUrl.protocol !== 'https:' ||
    publicUrl.hostname !== `${allowedRef}.supabase.co` ||
    publicUrl.username ||
    publicUrl.password
  ) {
    throw new Error('CI_DATABASE_DEVELOPMENT_TARGET_MISMATCH');
  }
  if (mode === 'customer') {
    // Three API pools plus three factory pools must fit the shared session
    // pooler's 15-client ceiling alongside the existing development services.
    database.searchParams.set('connection_limit', '1');
    database.searchParams.set('pool_timeout', '30');
    return { SUPABASE_DB_URL: database.href };
  }
  if (!environment.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('CI_DATABASE_ANON_KEY_REQUIRED');
  }
  // libpq does not accept Prisma-only URL options. Keep SSL and connection
  // settings, and connect only to the same approved project as the anon tests.
  for (const option of [
    'connection_limit',
    'pool_timeout',
    'pgbouncer',
    'schema',
    'statement_cache_size',
    'socket_timeout',
    'sslaccept',
  ]) {
    database.searchParams.delete(option);
  }
  return { SUPABASE_DIRECT_URL: database.href, PGCONNECT_TIMEOUT: '10' };
}

function writeEnvironment(values, environmentFile, append = appendFileSync, log = console.log) {
  if (!environmentFile) throw new Error('CI_DATABASE_GITHUB_ENV_REQUIRED');
  for (const [name, value] of Object.entries(values)) {
    if (/[\r\n]/.test(value)) throw new Error('CI_DATABASE_INVALID_ENV_VALUE');
    // Derived URLs are not necessarily covered by the original secret mask.
    if (name.startsWith('SUPABASE_')) log(`::add-mask::${value}`);
    append(environmentFile, `${name}=${value}\n`);
  }
}

if (require.main === module) {
  try {
    writeEnvironment(prepareDatabase(process.env, process.argv[2]), process.env.GITHUB_ENV);
    console.log('Approved development database configured; credential values are masked.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { prepareDatabase, writeEnvironment };
