/**
 * next-sitemap configuration for Feastpot.
 *
 * Runs as a `postbuild` step (see package.json). Generates:
 *   - public/sitemap.xml + public/sitemap-0.xml
 *   - public/robots.txt
 *
 * Account/checkout/order pages are excluded — they require auth and have no
 * SEO value. Vendor profile pages are added dynamically by querying the live
 * API for `status=live` vendors (capped at 1000 per call). If the API is
 * unreachable at build time we silently fall back to an empty list rather
 * than failing the whole build.
 */

/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://feastpot.co.uk',
  generateRobotsTxt: true,
  sitemapSize: 5000,
  changefreq: 'daily',
  priority: 0.7,

  // Routes that should never appear in the sitemap.
  exclude: [
    '/account/*',
    '/checkout',
    '/checkout/*',
    '/orders/*',
    '/auth/*',
    '/(auth)/*',
    '/offline',
  ],

  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        // Explicit allow for the SEO-critical surfaces so crawlers don't
        // have to infer permission from the broader `/` allow when a
        // narrower disallow sits on a sibling path.
        allow: ['/', '/vendors', '/vendors/'],
        disallow: [
          '/account',
          '/checkout',
          '/orders',
          '/auth',
          // Next 15 route group — the `(auth)` segment never appears in
          // the URL, but a crawler that picked up a stale link from a
          // build artefact should still be told to stay out.
          '/(auth)',
          '/api',
        ],
      },
    ],
  },

  /**
   * Inject the live vendor catalogue into the sitemap. The API URL falls
   * back to production if NEXT_PUBLIC_API_URL is unset (e.g. CI builds).
   */
  additionalPaths: async () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.feastpot.co.uk';
    try {
      const res = await fetch(`${apiUrl}/v1/vendors?limit=1000&status=live`, {
        // 15 s ceiling — we'd rather ship a smaller sitemap than block the build.
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[sitemap] vendor fetch returned ${res.status}; skipping vendor URLs`);
        return [];
      }
      const json = await res.json();
      const vendors = Array.isArray(json?.data) ? json.data : [];
      return vendors
        .filter((v) => v && typeof v.slug === 'string')
        .map((v) => ({
          loc: `/vendors/${v.slug}`,
          lastmod: v.updatedAt || new Date().toISOString(),
          changefreq: 'weekly',
          priority: 0.8,
        }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[sitemap] vendor fetch failed; building without vendor URLs', err);
      return [];
    }
  },
};
