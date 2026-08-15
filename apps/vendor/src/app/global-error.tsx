'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Last-resort boundary for crashes in the ROOT layout itself. Next.js renders
 * this in place of the root layout, so global CSS / Tailwind is NOT loaded.
 * Styles must be inline. Must render its own <html> and <body>.
 *
 * Like error.tsx this component calls the API on mount to persist a real
 * incident ref that support can look up.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [ref, setRef] = useState<string | null>(null);
  const hasLogged = useRef(false);

  useEffect(() => {
    console.error('[Vendor Portal] root layout error:', error);

    if (hasLogged.current) return;
    hasLogged.current = true;

    const apiBase =
      (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_API_URL : undefined) ??
      'https://api.feastpot.co.uk';

    fetch(`${apiBase}/v1/error-incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'vendor',
        route: typeof window !== 'undefined' ? window.location.pathname : '/',
        message: error.message || 'Root layout error',
        digest: error.digest,
      }),
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { ref?: string } | null) => {
        if (data?.ref) setRef(data.ref);
      })
      .catch(() => {
        /* suppress - error reporting must never throw */
      });
  }, [error]);

  const subject = ref ? `Error ${ref} - vendor portal` : 'Vendor portal error';
  const mailtoHref = `mailto:support@feastpot.co.uk?subject=${encodeURIComponent(subject)}`;

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
          <p style={{ fontSize: '14px', color: '#6b6b66', margin: '0 0 8px', lineHeight: 1.6 }}>
            We hit an unexpected error. It&rsquo;s been logged and we&rsquo;ll look into it.
          </p>
          {ref ? (
            <p
              style={{
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#9b9b96',
                margin: '0 0 24px',
              }}
            >
              Ref: {ref}
            </p>
          ) : (
            <p style={{ fontSize: '12px', color: '#c8c8c3', margin: '0 0 24px' }}>
              Logging error...
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
            <a
              href={mailtoHref}
              style={{
                display: 'block',
                padding: '10px 24px',
                background: 'transparent',
                color: '#6b6b66',
                border: '1px solid #d4d4cf',
                borderRadius: '10px',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              {ref ? `Contact support · ${ref}` : 'Contact support'}
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
