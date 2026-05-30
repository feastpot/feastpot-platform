'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary for crashes in the ROOT layout itself. Next.js renders
 * this in place of the root layout, so global CSS / Tailwind is NOT loaded —
 * styles must be inline. Must render its own <html> and <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[Vendor Portal] root layout error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F4F6F9',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          color: '#1c1c1a',
        }}
      >
        <div style={{ textAlign: 'center', padding: '40px', maxWidth: '420px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '14px', color: '#6b6b66', margin: '0 0 24px', lineHeight: 1.6 }}>
            We hit an unexpected error. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '12px 24px',
              background: '#185FA5',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 700,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
