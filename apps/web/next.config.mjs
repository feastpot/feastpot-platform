/**
 * Next.js 15 config for the Feastpot customer PWA.
 *
 * - `transpilePackages` is required so Next compiles our workspace TS source
 *   directly (we ship `@feastpot/ui` and `@feastpot/types` as raw .ts files
 *   pointed at by tsconfig `paths`, not pre-built dist bundles).
 * - PWA: a static `public/manifest.json` is shipped today so the app is
 *   installable on iOS/Android. A full Workbox service worker can be layered
 *   in later via `@ducanh2912/next-pwa` (the maintained fork that supports
 *   Next 15) — kept out of this scaffold to avoid a fragile build dep until
 *   we actually need offline behaviour.
 * - `allowedDevOrigins` lets the Replit proxy iframe (mTLS) load the app.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@feastpot/ui', '@feastpot/types'],
  experimental: {
    // Allow any host in dev so the Replit preview iframe can reach the dev server.
    // Production behaviour is unaffected.
  },
  // Next 15 honours `allowedDevOrigins` at the top level.
  allowedDevOrigins: ['*'],
};

export default nextConfig;
