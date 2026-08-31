'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { reportErrorIncident } from '@/lib/api/error-incidents';

const SUPPORT_EMAIL = 'support@feastpot.co.uk';

function contactHref(ref: string | null) {
  const subject = ref ? `Error ${ref} :  vendor portal` : 'Vendor portal error';
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/**
 * Route-segment error boundary for the vendor portal. Rendered inside the root
 * layout, so brand tokens are available.
 *
 * On mount this component calls the API to persist a real error incident and
 * receive an FP-XXXX-XXXX reference. "It's been logged" is literally true:
 * the ref maps to a row in error_incidents that support can look up in admin.
 *
 * Note on the "Try again" button colour: bg-vendor is the dominant accent
 * (blue) in the vendor portal Tailwind config. Colours are unchanged per
 * project instruction :  this is a deliberate product decision, not a default.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [ref, setRef] = useState<string | null>(null);
  const [refLoading, setRefLoading] = useState(true);
  const hasLogged = useRef(false);

  useEffect(() => {
    console.error('[Vendor Portal] route error:', error);

    if (hasLogged.current) return;
    hasLogged.current = true;

    const route = typeof window !== 'undefined' ? window.location.pathname : '/';

    reportErrorIncident({
      app: 'vendor',
      route,
      message: error.message || 'Unknown error',
      digest: error.digest,
    }).then((r) => {
      setRef(r);
      setRefLoading(false);
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mb-4 text-5xl" aria-hidden>
          ⚠️
        </div>
        <h1 className="font-display text-2xl font-black tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm font-medium text-muted-foreground">
          We hit an unexpected error. It&rsquo;s been logged and we&rsquo;ll look into it.
        </p>

        {/* Reference :  always shown once logging completes */}
        <p className="mt-3 font-mono text-xs text-muted-foreground/70" aria-live="polite">
          {refLoading
            ? 'Logging\u2026'
            : ref
              ? `Ref: ${ref}`
              : error.digest
                ? `Diagnostic: ${error.digest}`
                : null}
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex w-full items-center justify-center rounded-xl bg-vendor px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-vendor-dark"
          >
            Try again
          </button>

          <button
            type="button"
            onClick={() => router.push('/')}
            className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-background px-6 py-3 text-sm font-bold text-foreground transition hover:bg-muted"
          >
            Go to dashboard
          </button>

          <a
            href={contactHref(ref)}
            className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-background px-6 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-muted"
          >
            Contact support{ref ? ` \u00b7 ${ref}` : ''}
          </a>
        </div>
      </div>
    </div>
  );
}
