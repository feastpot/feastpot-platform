import { ImageResponse } from 'next/og';

import { getVendorBySlug } from '@/lib/api/vendors';

export const runtime = 'edge';
export const alt = 'Feastpot vendor';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface Props {
  // Next 15 made dynamic route params async to support PPR. Match the
  // sibling page.tsx contract.
  params: Promise<{ slug: string }>;
}

/**
 * Per-vendor OG card. Falls back to the generic Feastpot card if the vendor
 * lookup fails so social shares never serve a broken image. ImageResponse
 * runs at the edge on every request — no static caching here, but Next will
 * stamp a stable URL with a content hash.
 */
export default async function VendorOgImage({ params }: Props) {
  const { slug } = await params;
  let businessName = 'Feastpot';
  let cuisines: string[] = [];
  let rating: number | null = null;
  let ratingCount = 0;

  try {
    const vendor = await getVendorBySlug(slug, { next: { revalidate: 300 } });
    businessName = vendor.businessName;
    cuisines = vendor.cuisines ?? [];
    rating = vendor.rating > 0 ? vendor.rating : null;
    ratingCount = vendor.ratingCount;
  } catch {
    // Swallow — render the generic fallback below.
  }

  return new ImageResponse(
    (
      <div
        style={{
          background: '#E8520A',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, fontWeight: 700, color: 'rgba(255,255,255,0.85)', letterSpacing: '-1px' }}>
          feastpot
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 84, fontWeight: 800, color: 'white', letterSpacing: '-2px', lineHeight: 1.05 }}>
            {businessName}
          </div>
          {cuisines.length > 0 && (
            <div style={{ display: 'flex', marginTop: 24, fontSize: 32, color: 'rgba(255,255,255,0.85)' }}>
              {cuisines.slice(0, 3).join(' · ')}
            </div>
          )}
          {rating !== null && (
            <div style={{ display: 'flex', marginTop: 16, fontSize: 28, color: 'rgba(255,255,255,0.7)' }}>
              ★ {rating.toFixed(1)} ({ratingCount} reviews)
            </div>
          )}
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: 'rgba(255,255,255,0.6)' }}>
          Order on feastpot.co.uk
        </div>
      </div>
    ),
    { ...size },
  );
}
