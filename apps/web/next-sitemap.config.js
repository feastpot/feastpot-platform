/**
 * next-sitemap configuration for Feastpot.
 *
 * Runs as a `postbuild` step (see package.json). Generates:
 *   - public/sitemap.xml + public/sitemap-0.xml
 *   - public/robots.txt
 *
 * Account/checkout/order pages are excluded - they require auth and have no
 * SEO value. Vendor profile pages are added dynamically by querying the live
 * API for `status=live` vendors, following every cursor at the API's
 * 100-row limit. Missing required vendor data fails the build.
 */
const { fetchVendorPaths } = require('./scripts/sitemap-vendors.cjs');

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
          // Next 15 route group - the `(auth)` segment never appears in
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
    // Static occasion landing pages (apps/web/src/lib/occasions.ts).
    const occasionPaths = [
      'sunday-family-meal',
      'birthday-party-trays',
      'wedding-and-events',
      'office-catering',
      'weekly-meal-prep',
      'baby-shower-food',
      'small-chops',
      'frozen-soup-packs',
    ].map((slug) => ({
      loc: `/occasions/${slug}`,
      lastmod: new Date().toISOString(),
      changefreq: 'monthly',
      priority: 0.7,
    }));

    const apiUrl =
      process.env.SITEMAP_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'https://api.feastpot.co.uk';
    return [...occasionPaths, ...(await fetchVendorPaths(apiUrl))];
  },
};
