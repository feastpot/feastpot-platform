const PAGE_SIZE = 100;
const MAX_PAGES = 10_000;

/**
 * Use the public catalogue's publication gates, never a privileged vendor list.
 * Missing, malformed or incomplete data must stop the build, not reduce SEO coverage.
 */
async function fetchVendorPaths(apiUrl, fetcher = fetch) {
  const paths = new Map();
  const cursors = new Set();
  let cursor;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${apiUrl.replace(/\/$/, '')}/v1/vendors`);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('status', 'live');
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      throw new Error(`[sitemap] Vendor catalogue returned HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (
      !payload ||
      !Array.isArray(payload.data) ||
      !(payload.nextCursor === null || typeof payload.nextCursor === 'string') ||
      payload.data.length > PAGE_SIZE
    ) {
      throw new Error('[sitemap] Invalid vendor catalogue response');
    }
    for (const vendor of payload.data) {
      // Public demo kitchens may appear in discovery but must not be indexed as live sellers.
      if (vendor?.publicDemo === true) continue;
      if (
        !vendor ||
        vendor.status !== 'live' ||
        typeof vendor.slug !== 'string' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(vendor.slug)
      ) {
        throw new Error('[sitemap] Invalid live vendor profile in catalogue');
      }
      const loc = `/vendors/${vendor.slug}`;
      if (paths.has(loc)) throw new Error('[sitemap] Duplicate vendor across catalogue pages');
      paths.set(loc, { loc, changefreq: 'weekly', priority: 0.8 });
    }
    if (payload.nextCursor === null) {
      if (paths.size === 0) {
        throw new Error(
          '[sitemap] Required live vendor profiles are missing; refusing incomplete sitemap',
        );
      }
      return [...paths.values()];
    }
    if (!payload.data.length || !payload.nextCursor || cursors.has(payload.nextCursor)) {
      throw new Error('[sitemap] Vendor pagination did not advance');
    }
    cursors.add(payload.nextCursor);
    cursor = payload.nextCursor;
  }
  throw new Error('[sitemap] Vendor pagination exceeded safety limit');
}

module.exports = { fetchVendorPaths };
