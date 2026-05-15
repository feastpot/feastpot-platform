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
  // Cache the App Router payloads for routes the user has already navigated
  // through, so client-side back/forward and Link prefetch hits stay snappy
  // even on a flaky train-tunnel connection. Pairs with the navigate
  // NetworkFirst handler below for the initial document request.
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  // When the device comes back online, refresh open tabs so users don't
  // keep staring at a stale "you're offline" shell after their wifi returns.
  reloadOnOnline: true,
  // Aggressive: skip the install-then-activate handshake so a returning user
  // sees the new SW immediately. Safe because we have no in-flight long-lived
  // SW state (no offline mutation queue yet). The <SWUpdatePrompt> in the
  // root layout still surfaces a toast so users can opt to reload.
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
      {
        // Top-level page navigations — try the network first (so users see
        // fresh menus/prices), then fall back to the cached HTML, and only
        // then to the precached /offline shell via `fallbacks.document`.
        //
        // We use a regex (not a `({request}) => request.mode === 'navigate'`
        // callback) because @ducanh2912/next-pwa serialises the runtime
        // config through workbox-build, which silently drops function-typed
        // urlPatterns — leaving navigations completely unrouted in the
        // generated `public/sw.js`. The regex matches "extension-less"
        // same-origin URLs (i.e. document requests) and explicitly excludes
        // `/_next/`, `/api/`, and `/sw.js` so they keep falling through to
        // their dedicated handlers above.
        urlPattern: /^https?:\/\/[^/]+\/(?!_next\/|api\/|sw\.js)[^.]*$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages-cache',
          networkTimeoutSeconds: 5,
          expiration: { maxAgeSeconds: 60 * 60 * 24, maxEntries: 50 },
        },
      },
    ],
  },
  disable: process.env.NODE_ENV === 'development',
  // Fallback shell shown when network is gone AND the requested document
  // isn't precached. Matches the route created in `src/app/offline/page.tsx`.
  fallbacks: { document: '/offline' },
});

/**
 * Supabase Storage public bucket — derived from NEXT_PUBLIC_SUPABASE_URL so
 * the same image domain works in dev (project-ref.supabase.co) and prod
 * without a hardcode. Falls back to the wildcard pattern below.
 */
const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : null;
  } catch {
    return null;
  }
})();

/**
 * Origin used by the dev rewrite below to reach the NestJS API container.
 * In Replit (and on a developer's laptop) the API listens on port 3001 of
 * the same host that runs Next, so `localhost:3001` is correct from the
 * Next process. Override with `API_PROXY_TARGET` if you ever run them on
 * different hosts (e.g. docker-compose with named services).
 */
const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:3001';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@feastpot/ui', '@feastpot/types'],
  allowedDevOrigins: ['*.replit.dev', '*.worf.replit.dev'],
  poweredByHeader: false,
  compress: true,
  /**
   * Proxy `/v1/*` to the API container so the browser can reach it via the
   * same origin as the Next app. Required in Replit because the user's
   * browser cannot resolve `localhost:3001` (the API is in a remote
   * container), and useful on a developer laptop because it sidesteps CORS
   * entirely. Production sets NEXT_PUBLIC_API_URL to the public API origin
   * and skips this rewrite path entirely (`API_URL` becomes absolute, so
   * fetches don't hit `/v1/*` on the Next origin).
   */
  async rewrites() {
    return [
      {
        source: '/v1/:path*',
        destination: `${API_PROXY_TARGET}/v1/:path*`,
      },
    ];
  },
  images: {
    // Allow next/image to optimise Supabase Storage public-bucket URLs
    // (vendor cover photos, menu item photos, avatars). The exact host
    // is derived above; a wildcard fallback covers the rare case where
    // NEXT_PUBLIC_SUPABASE_URL isn't set at build time.
    remotePatterns: [
      ...(supabaseHost
        ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
        : []),
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 86_400, // 24 h — Supabase URLs are immutable per upload
    // Mobile-first viewport widths so Next emits the right srcset breakpoints
    // for the customer PWA's `max-w-lg` layout (no desktop hero images yet).
    deviceSizes: [375, 640, 750, 828, 1080],
    imageSizes: [88, 176, 256, 384],
  },
};

// Optional bundle analyser — only loaded when ANALYZE=true so the dependency
// stays a devDep that doesn't bloat the runtime image. Run with:
//   ANALYZE=true npm run build --workspace=@feastpot/web
let withBundleAnalyzer = (cfg) => cfg;
if (process.env.ANALYZE === 'true') {
  try {
    const mod = await import('@next/bundle-analyzer');
    withBundleAnalyzer = mod.default({ enabled: true });
  } catch {
    console.warn('[next.config] ANALYZE=true but @next/bundle-analyzer is not installed');
  }
}

export default withBundleAnalyzer(withPWA(nextConfig));
