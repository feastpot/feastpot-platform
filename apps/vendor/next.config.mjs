/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack(config, { dev }) {
    // Avoid oversized-string filesystem pack warnings in one-shot production
    // builds. Turbo caches complete outputs; dev keeps Next's usual HMR cache.
    if (!dev) config.cache = { type: 'memory' };
    return config;
  },
  // Transpile workspace packages so their TS sources compile through Next's
  // SWC pipeline (they ship raw .ts/.tsx, not pre-built dist/).
  transpilePackages: ['@feastpot/ui', '@feastpot/types'],
  experimental: {
    // Allow Server Components to import from monorepo workspace packages
    // without "Module not found" warnings.
    externalDir: true,
  },
  // Lets the Replit proxy iframe (mTLS, cross-origin host) load dev pages
  // without Next 15's cross-origin warning blocking HMR/RSC.
  allowedDevOrigins: ['*'],
};

export default nextConfig;
