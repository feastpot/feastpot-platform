'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { apiRequest } from '@/lib/api/client';
import { useAccessToken } from '@/lib/auth/use-access-token';

interface CurrentVersion {
  id: string;
  version: string;
  effectiveAt: string;
}

interface AcceptanceStatus {
  accepted: boolean;
}

/**
 * Client component that sits in the root layout and blocks the UI with a
 * full-screen overlay when:
 *   - The current live Vendor Terms have an effectiveAt <= now (the version
 *     is live), AND
 *   - This vendor has not yet explicitly accepted or been recorded as
 *     DEEMED_CONTINUED_USE.
 *
 * Reuses the existing /onboarding/terms click-wrap page rather than
 * embedding a second copy of the acceptance UI. The vendor cannot dismiss
 * this overlay without accepting -- the "Close account instead" escape hatch
 * routes to the guided closure flow to honour outstanding orders.
 *
 * DO NOT add a "skip for now" button. Continuing to trade without
 * re-acceptance is recorded as DEEMED_CONTINUED_USE by the nightly sweep,
 * but explicit click-wrap is stronger evidence and MUST be prompted.
 */
export function ReAcceptanceGate({ children }: { children: React.ReactNode }) {
  const { token, loading } = useAccessToken();
  const [needsAcceptance, setNeedsAcceptance] = useState(false);
  const [version, setVersion] = useState<CurrentVersion | null>(null);

  useEffect(() => {
    if (loading || !token) return;

    async function check() {
      try {
        const [current, status] = await Promise.all([
          apiRequest<CurrentVersion>('/terms/current?documentType=VENDOR_TERMS').catch(
            () => null,
          ),
          apiRequest<AcceptanceStatus>('/terms/acceptance-status', {
            accessToken: token!,
          }).catch(() => ({ accepted: true })), // fail open -- don't block on API error
        ]);

        if (!current) return; // No live version yet -- nothing to gate on.

        const effectiveAt = new Date(current.effectiveAt);
        const isLive = effectiveAt <= new Date();

        if (isLive && !status.accepted) {
          setVersion(current);
          setNeedsAcceptance(true);
        }
      } catch {
        // Fail open: never block a vendor from the dashboard due to an API error.
      }
    }

    void check();
  }, [token, loading]);

  if (needsAcceptance && version) {
    const effectiveDateStr = new Date(version.effectiveAt).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    return (
      <>
        {/* Render children behind the overlay so the DOM is not torn down. */}
        <div aria-hidden className="pointer-events-none select-none opacity-0">
          {children}
        </div>

        {/* Full-screen overlay: no dismiss without acceptance. */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reaccept-title"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white p-6"
        >
          <div className="w-full max-w-lg space-y-5 rounded-2xl border border-amber-200 bg-amber-50 p-8 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-2xl" aria-hidden>
                📋
              </span>
              <div>
                <h1
                  id="reaccept-title"
                  className="text-lg font-semibold text-amber-900"
                >
                  Updated Vendor Terms now in effect
                </h1>
                <p className="mt-1 text-sm text-amber-800">
                  Version {version.version} took effect on {effectiveDateStr}. You must
                  review and accept the new terms before continuing to trade on Feastpot.
                </p>
              </div>
            </div>

            <p className="text-sm text-amber-700">
              By accepting you confirm you have read the updated terms, including the revised
              Rate Schedule (Annex A). This takes about 5 minutes.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/onboarding/terms"
                className="flex-1 rounded-lg bg-amber-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-amber-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-600"
              >
                Review and accept terms
              </Link>
              <Link
                href="/settings/close-account"
                className="flex-1 rounded-lg border border-amber-300 bg-white px-4 py-2.5 text-center text-sm font-medium text-amber-800 hover:bg-amber-50"
              >
                Close my account instead
              </Link>
            </div>

            <p className="text-xs text-amber-600">
              If you close your account, outstanding orders and catering bookings will be
              honoured and your final payout processed within the standard schedule.
            </p>
          </div>
        </div>
      </>
    );
  }

  return <>{children}</>;
}
