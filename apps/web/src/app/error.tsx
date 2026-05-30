'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Route-segment error boundary for the customer PWA. Rendered inside the root
 * layout, so global CSS + brand tokens are available — we use the same Tailwind
 * brand-token conventions as `not-found.tsx` rather than inline styles.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error('[Feastpot] route error:', error);
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
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-muted-foreground/70">Ref: {error.digest}</p>
        ) : null}
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex w-full items-center justify-center rounded-xl bg-brand px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-brand-dark"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-background px-6 py-3 text-sm font-bold text-foreground transition hover:bg-muted"
          >
            Go to Feastpot
          </button>
        </div>
      </div>
    </div>
  );
}
