import type { NextConfig } from 'next';

// Derive the Supabase storage hostname from the public env var so
// next/image can load images from the storage bucket without a
// hard-coded subdomain (which changes per Supabase project).
function supabaseHostname(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return '*.supabase.co';
  try {
    return new URL(url).hostname;
  } catch {
    return '*.supabase.co';
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
  images: {
    // Allow next/image to serve images from Supabase Storage.
    // The hostname is read at build time from NEXT_PUBLIC_SUPABASE_URL so
    // the same config works for both the dev and prod Supabase projects.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: supabaseHostname(),
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
