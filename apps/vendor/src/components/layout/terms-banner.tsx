'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

interface DashboardNotice {
  id: string;
  termsVersionId: string;
  sentAt: string;
  acknowledgedAt: string | null;
  termsVersion: {
    id: string;
    version: string;
    effectiveAt: string;
    changeSummary: string;
    documentType: string;
  };
}

function daysUntil(dateIso: string): number {
  const now = Date.now();
  const target = new Date(dateIso).getTime();
  return Math.max(0, Math.ceil((target - now) / (1000 * 60 * 60 * 24)));
}

/**
 * Persistent top-of-page banner shown when there are unacknowledged DASHBOARD
 * change notices. Fetched client-side via the vendor auth token.
 *
 * NOT dismissible without an explicit acknowledgement. The vendor can dim the
 * banner by clicking "Acknowledge", but the re-acceptance gate will still
 * appear on the effective date.
 *
 * Design rules (enforced in code):
 * - Declining is no harder than acknowledging: the "Close account" link is
 *   at the same visual weight as the "Review terms" link.
 * - The countdown is accurate to the effective date (recomputed on render).
 */
export function TermsBanner() {
  const { token, loading } = useAccessToken();
  const [notices, setNotices] = useState<DashboardNotice[]>([]);
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !token) return;
    apiRequest<DashboardNotice[]>('/terms/notices', { accessToken: token })
      .then(setNotices)
      .catch(() => null);
  }, [token, loading]);

  // Only show unacknowledged notices (the API filters them, but guard locally too).
  const visible = notices.filter((n) => n.acknowledgedAt === null);
  if (visible.length === 0) return null;

  const notice = visible[0]!;
  const v = notice.termsVersion;
  const days = daysUntil(v.effectiveAt);
  const effectiveDateStr = new Date(v.effectiveAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const handleAcknowledge = async () => {
    if (!token || acknowledging) return;
    setAcknowledging(notice.id);
    try {
      await apiRequest(`/terms/notices/${notice.id}/acknowledge`, {
        accessToken: token,
        method: 'POST',
      });
      setNotices((prev) =>
        prev.map((n) =>
          n.id === notice.id ? { ...n, acknowledgedAt: new Date().toISOString() } : n,
        ),
      );
    } catch {
      // If acknowledge fails, leave the banner showing.
    } finally {
      setAcknowledging(null);
    }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
        <span className="shrink-0 text-base leading-5" aria-hidden>
          📋
        </span>

        <div className="flex-1 space-y-1">
          <p className="leading-5">
            <strong>
              Vendor Terms update (v{v.version}){' '}
              {days > 0 ? `(takes effect in ${days} day${days !== 1 ? 's' : ''})` : '(now in effect)'}.
            </strong>{' '}
            Effective {effectiveDateStr}. You may terminate without penalty before this date.
          </p>
          {v.changeSummary && (
            <p className="text-xs text-amber-700 line-clamp-2">{v.changeSummary}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Link
            href="/onboarding/terms"
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600"
          >
            Review &amp; accept
          </Link>
          <Link
            href="/settings/close-account"
            className="text-xs font-medium text-amber-800 underline underline-offset-2 hover:text-amber-700"
          >
            Close account
          </Link>
          <button
            type="button"
            onClick={() => void handleAcknowledge()}
            disabled={!!acknowledging}
            aria-label="Acknowledge this change notice"
            className="text-xs text-amber-700 underline underline-offset-2 hover:text-amber-600 disabled:opacity-50"
          >
            {acknowledging ? 'Acknowledging…' : 'Acknowledge'}
          </button>
        </div>
      </div>
    </div>
  );
}
