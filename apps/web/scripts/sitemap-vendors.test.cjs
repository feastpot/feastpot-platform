const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { mkdtemp, mkdir, readFile, writeFile, rm, readdir } = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');
const { test } = require('node:test');

const { fetchVendorPaths } = require('./sitemap-vendors.cjs');
const { verifySitemap } = require('./verify-sitemap.cjs');
const { isNonReleaseBuild } = require('./generate-sitemap.cjs');
const execute = promisify(execFile);
const vendor = (slug) => ({ slug, status: 'live', publicDemo: false });
const response = (data, nextCursor = null) => ({
  ok: true,
  json: async () => ({ data, nextCursor }),
});

test('follows every cursor using the API limit and includes profiles beyond 1000', async () => {
  const calls = [];
  const paths = await fetchVendorPaths('https://example.test', async (url) => {
    calls.push(url);
    const page = Number(url.searchParams.get('cursor') || 0);
    const count = page === 10 ? 5 : 100;
    return response(
      Array.from({ length: count }, (_, index) => vendor(`kitchen-${page * 100 + index}`)),
      page === 10 ? null : String(page + 1),
    );
  });
  assert.equal(paths.length, 1005);
  assert.equal(calls.length, 11);
  assert.ok(calls.every((url) => url.searchParams.get('limit') === '100'));
  assert.ok(calls.every((url) => url.searchParams.get('status') === 'live'));
  assert.equal(paths.at(-1).loc, '/vendors/kitchen-1004');
});

for (const [name, fetcher, message] of [
  ['HTTP error', async () => ({ ok: false, status: 400 }), /HTTP 400/],
  [
    'network failure',
    async () => {
      throw new Error('network unavailable');
    },
    /network unavailable/,
  ],
  ['empty catalogue', async () => response([]), /Required live vendor profiles/],
  [
    'demo-only catalogue',
    async () => response([{ slug: 'demo', publicDemo: true }]),
    /Required live vendor profiles/,
  ],
  [
    'malformed envelope',
    async () => ({ ok: true, json: async () => ({ data: [] }) }),
    /Invalid vendor catalogue/,
  ],
  ['invalid slug', async () => response([vendor('../account')]), /Invalid live vendor profile/],
  [
    'non-live seller',
    async () => response([{ slug: 'suspended', status: 'suspended' }]),
    /Invalid live vendor profile/,
  ],
  [
    'oversized page',
    async () => response(Array.from({ length: 101 }, (_, i) => vendor(`kitchen-${i}`))),
    /Invalid vendor catalogue/,
  ],
]) {
  test(`rejects ${name}`, async () =>
    assert.rejects(fetchVendorPaths('https://example.test', fetcher), message));
}

test('rejects cursor cycles, duplicate profiles and errors on later pages', async () => {
  let calls = 0;
  await assert.rejects(
    fetchVendorPaths('https://example.test', async () =>
      response([vendor(`kitchen-${calls++}`)], 'same-cursor'),
    ),
    /pagination did not advance/,
  );
  await assert.rejects(
    fetchVendorPaths('https://example.test', async () => response([vendor('duplicate')], 'next')),
    /Duplicate vendor/,
  );
  calls = 0;
  await assert.rejects(
    fetchVendorPaths('https://example.test', async () =>
      calls++ === 0 ? response([vendor('first')], 'next') : { ok: false, status: 503 },
    ),
    /HTTP 503/,
  );
});

test('real postbuild writes vendor XML and exits nonzero for missing data or missing manifests', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'feastpot-sitemap-'));
  let payload = { data: [vendor('sitemap-test-kitchen')], nextCursor: null };
  const server = http.createServer((_request, reply) => {
    reply.setHeader('Content-Type', 'application/json');
    reply.end(JSON.stringify(payload));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const apiUrl = `http://127.0.0.1:${server.address().port}`;
  const configPath = path.resolve(__dirname, '../next-sitemap.config.js');
  const command = path.resolve(__dirname, 'generate-sitemap.cjs');
  const options = {
    cwd: directory,
    env: {
      ...process.env,
      VERCEL_ENV: 'production',
      SITEMAP_API_URL: apiUrl,
      NEXT_PUBLIC_SITE_URL: 'https://example.test',
    },
  };
  try {
    await mkdir(path.join(directory, 'public'));
    await mkdir(path.join(directory, '.next'));
    await writeFile(
      path.join(directory, 'next-sitemap.config.js'),
      `module.exports = require(${JSON.stringify(configPath)});`,
    );
    await writeFile(
      path.join(directory, '.next/build-manifest.json'),
      JSON.stringify({ pages: { '/': [] } }),
    );
    await writeFile(
      path.join(directory, '.next/prerender-manifest.json'),
      JSON.stringify({ routes: {}, dynamicRoutes: {}, notFoundRoutes: [] }),
    );
    await writeFile(
      path.join(directory, '.next/routes-manifest.json'),
      JSON.stringify({ staticRoutes: [], dynamicRoutes: [] }),
    );
    const result = await execute(process.execPath, [command], options);
    assert.match(result.stdout, /Verified 1 vendor profiles/);
    const xml = await readFile(path.join(directory, 'public/sitemap-0.xml'), 'utf8');
    assert.match(xml, /<loc>https:\/\/example\.test\/vendors\/sitemap-test-kitchen<\/loc>/);
    assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
    const required = [{ loc: '/vendors/sitemap-test-kitchen' }];
    const verified = await verifySitemap(
      path.join(directory, 'public'),
      'https://example.test',
      required,
    );
    assert.equal(verified.vendors, 1);
    assert.equal(verified.files, 1);
    assert.ok(verified.urls >= 9);
    await writeFile(path.join(directory, 'public/sitemap-0.xml'), xml.replace('</urlset>', ''));
    await assert.rejects(
      verifySitemap(path.join(directory, 'public'), 'https://example.test', required),
      /Malformed XML/,
    );
    await writeFile(
      path.join(directory, 'public/sitemap-0.xml'),
      xml.replace('/vendors/sitemap-test-kitchen', '/vendors/other-kitchen'),
    );
    await assert.rejects(
      verifySitemap(path.join(directory, 'public'), 'https://example.test', required),
      /missing required vendor/,
    );
    await writeFile(path.join(directory, 'public/sitemap-0.xml'), xml);

    payload = { data: [], nextCursor: null };
    await assert.rejects(
      execute(process.execPath, [command], options),
      (error) => error.code === 1 && /Required live vendor profiles/.test(error.stderr),
    );
    assert.ok(
      !(await readdir(path.join(directory, 'public'))).some((file) => file.endsWith('.xml')),
    );

    payload = { data: [vendor('sitemap-test-kitchen')], nextCursor: null };
    await rm(path.join(directory, '.next/build-manifest.json'));
    await assert.rejects(
      execute(process.execPath, [command], options),
      (error) => error.code === 1,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
test('only explicit non-release environments omit sitemaps', () => {
  assert.equal(isNonReleaseBuild({}), false);
  assert.equal(isNonReleaseBuild({ CI: 'true' }), false);
  assert.equal(isNonReleaseBuild({ CI: 'true', GITHUB_ACTIONS: 'true' }), true);
  assert.equal(isNonReleaseBuild({ VERCEL_ENV: 'preview' }), true);
  assert.equal(isNonReleaseBuild({ VERCEL_ENV: 'development' }), true);
  assert.equal(
    isNonReleaseBuild({ VERCEL_ENV: 'production', CI: 'true', GITHUB_ACTIONS: 'true' }),
    false,
  );
});

test('Vercel previews send noindex headers, while production does not', async () => {
  const configPath = path.resolve(__dirname, '../next.config.mjs');
  for (const environment of ['preview', 'production']) {
    const result = await execute(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const config = (await import(${JSON.stringify(configPath)})).default;
         console.log(JSON.stringify(await config.headers()));`,
      ],
      { env: { ...process.env, VERCEL_ENV: environment } },
    );
    const headers = JSON.parse(result.stdout.trim());
    if (environment === 'production') assert.deepEqual(headers, []);
    else {
      assert.deepEqual(headers, [
        {
          source: '/:path*',
          headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
        },
      ]);
    }
  }
});

test('non-release postbuild deletes stale sitemaps and blocks crawlers without fetching vendors', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'feastpot-preview-sitemap-'));
  const command = path.resolve(__dirname, 'generate-sitemap.cjs');
  try {
    await mkdir(path.join(directory, 'public'));
    await writeFile(
      path.join(directory, 'next-sitemap.config.js'),
      'module.exports = { additionalPaths: async () => { throw new Error("must not fetch"); } };',
    );
    await writeFile(path.join(directory, 'public/sitemap.xml'), 'stale production sitemap');
    await writeFile(path.join(directory, 'public/sitemap-0.xml'), 'stale vendor profiles');
    await writeFile(path.join(directory, 'public/robots.txt'), 'User-agent: *\nAllow: /');
    const result = await execute(process.execPath, [command], {
      cwd: directory,
      env: { ...process.env, VERCEL_ENV: 'preview' },
    });
    assert.match(result.stdout, /Non-release build/);
    assert.deepEqual(await readdir(path.join(directory, 'public')), ['robots.txt']);
    assert.equal(
      await readFile(path.join(directory, 'public/robots.txt'), 'utf8'),
      'User-agent: *\nDisallow: /\n',
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
