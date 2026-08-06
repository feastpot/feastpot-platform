'use client';

import { X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

interface PendingTerms {
  id: string;
  version: string;
  effectiveAt: string;
}

/**
 * Persistent top-of-page banner shown when there are unacknowledged future
 * terms versions. Fetched client-side via the vendor auth token.
 * Dismissible within the session only (re-appears on next load until accepted).
 */
export function TermsBanner() {
  const { token, loading } = useAccessToken();
  const [pending, setPending] = useState<PendingTerms[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (loading || !token) return;
    apiRequest<PendingTerms[]>('/terms/pending', { accessToken: token })
      .then(setPending)
      .catch(() => null);
  }, [token, loading]);

  if (dismissed || pending.length === 0) return null;

  const next = pending[0]!;
  const effectiveDateStr = new Date(next.effectiveAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div
      role="alert"
      className="relative flex items-start gap-3 bg-amber-50 px-4 py-3 text-sm text-amber-900 border-b border-amber-200"
    >
      <span className="shrink-0 text-base leading-5" aria-hidden>
        📋
      </span>
      <p className="flex-1 leading-5">
        Our Vendor Terms are being updated (v{next.version}, effective {effectiveDateStr}).{' '}
        <Link href="/terms" className="font-semibold underline underline-offset-2 hover:text-amber-700">
          View and acknowledge
        </Link>{' '}
        before the effective date. You may terminate without penalty during the notice period.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss terms update banner"
        className="shrink-0 rounded p-0.5 hover:bg-amber-100"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
