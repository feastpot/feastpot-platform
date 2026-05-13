import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #1C1C1A 0%, #3D1A0A 100%)',
          width: 180,
          height: 180,
          borderRadius: 36,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 100,
        }}
      >
        🍲
      </div>
    ),
    { ...size },
  );
}
