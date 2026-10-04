// Only authenticated acceptance suites share the small external Supabase pool.
// Unit/database and financial suites keep their own concurrency configuration.
if (process.env.FEASTPOT_TEST_ENVIRONMENT === 'authoritative') {
  for (const key of ['SUPABASE_DB_URL', 'SUPABASE_DIRECT_URL']) {
    if (!process.env[key]) continue;
    const url = new URL(process.env[key]);
    const configured = Number(url.searchParams.get('connection_limit'));
    url.searchParams.set('connection_limit', String(configured > 0 ? Math.min(configured, 2) : 2));
    process.env[key] = url.toString();
  }
}
