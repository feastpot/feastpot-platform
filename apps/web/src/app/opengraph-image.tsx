import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Feastpot - Authentic African & Caribbean Food Delivered';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#E8520A',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 800, color: 'white', letterSpacing: '-3px' }}>
          feastpot
        </div>
        <div style={{ fontSize: 36, color: 'rgba(255,255,255,0.85)', marginTop: 16 }}>
          Authentic African & Caribbean Food Delivered
        </div>
        <div style={{ fontSize: 24, color: 'rgba(255,255,255,0.6)', marginTop: 12 }}>
          feastpot.co.uk
        </div>
      </div>
    ),
    { ...size },
  );
}
