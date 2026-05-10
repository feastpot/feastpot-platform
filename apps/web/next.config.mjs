import withPWAInit from '@ducanh2912/next-pwa';

/**
 * Next.js 15 config for the Feastpot customer PWA.
 *
 * - `transpilePackages` is required so Next compiles our workspace TS source
 *   directly (we ship `@feastpot/ui` and `@feastpot/types` as raw .ts files
 *   pointed at by tsconfig `paths`, not pre-built dist bundles).
 * - PWA: powered by `@ducanh2912/next-pwa` (the maintained fork — `next-pwa`
 *   is unmaintained and breaks on Next 15). Disabled in dev so HMR + RSC keep
 *   working; enabled for production builds.
 * - Custom service worker logic for push notifications lives in
 *   `public/sw-custom.js` and is `importScripts()`d into the generated SW.
 * - `allowedDevOrigins` lets the Replit proxy iframe (mTLS) load the app.
 */
const withPWA = withPWAInit({
  dest: 'public',
  register: true,
  // Aggressive: skip the install-then-activate handshake so a returning user
  // sees the new SW immediately. Safe because we have no in-flight long-lived
  // SW state (no offline mutation queue yet).
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    importScripts: ['/sw-custom.js'],
    runtimeCaching: [
      {
        // API JSON for vendor discovery — fresh-first with a 5-min fallback.
        urlPattern: /^https:\/\/api\.feastpot\.co\.uk\/v1\/vendors\//,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'vendors-cache',
          expiration: { maxAgeSeconds: 300, maxEntries: 60 },
        },
      },
      {
        // Supabase Storage images — heavy, immutable. Cache aggressively.
        urlPattern: /^https:\/\/.*supabase.*\/storage\//,
        handler: 'CacheFirst',
        options: {
          cacheName: 'images-cache',
          expiration: { maxAgeSeconds: 86_400, maxEntries: 200 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        // Next's content-hashed static assets — safe to cache forever.
        urlPattern: /\/_next\/static\//,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-cache',
          expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
        },
      },
    ],
  },
  disable: process.env.NODE_ENV === 'development',
  // Fallback shell shown when network is gone AND the requested document
  // isn't precached. Matches the route created in `src/app/offline/page.tsx`.
  fallbacks: { document: '/offline' },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@feastpot/ui', '@feastpot/types'],
  allowedDevOrigins: ['*'],
};

export default withPWA(nextConfig);
