'use client';

import { useEffect, useRef, useState } from 'react';

import { reportErrorIncident } from '@/lib/api/error-incidents';

/**
 * Last-resort boundary for crashes in the ROOT layout itself. Next.js renders
 * this in place of the root layout, so global CSS / Tailwind is NOT loaded -
 * styles must be inline. Must render its own <html> and <body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [incidentRef, setIncidentRef] = useState<string | null>(null);
  const hasReported = useRef(false);

  useEffect(() => {
    console.error('[Admin Panel] root layout error:', error);
    if (hasReported.current) return;
    hasReported.current = true;
    void reportErrorIncident({
      app: 'admin',
      route: window.location.pathname,
      message: error.message || 'Root layout error',
      digest: error.digest,
    }).then(setIncidentRef);
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
          background: '#F5F5F4',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          color: '#1c1c1a',
        }}
      >
        <div style={{ textAlign: 'center', padding: '40px', maxWidth: '420px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>⚠️</div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 8px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: '14px', color: '#6b6b66', margin: '0 0 8px', lineHeight: 1.6 }}>
            We hit an unexpected error. It&rsquo;s been logged and we&rsquo;ll look into it.
          </p>
          <p
            style={{
              fontSize: '12px',
              fontFamily: 'monospace',
              color: '#9b9b96',
              margin: '0 0 24px',
            }}
          >
            {incidentRef ? `Ref: ${incidentRef}` : 'Logging error...'}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '12px 24px',
              background: '#1c1c1a',
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
