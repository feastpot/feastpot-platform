import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#E8520A',
          width: 180,
          height: 180,
          borderRadius: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: 112,
          fontWeight: 800,
          fontFamily: 'sans-serif',
        }}
      >
        F
      </div>
    ),
    { ...size },
  );
}
