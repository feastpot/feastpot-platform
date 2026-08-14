'use client';

/**
 * VerificationStateBanner
 *
 * Shows a persistent top-of-dashboard alert when a vendor's Feastpot
 * verification is SUSPENDED or RENEWAL_DUE. Reads overallState directly from
 * the verification record, independently of document upload status, so a
 * vendor cannot be suspended and unaware.
 *
 * Design rules:
 *   SUSPENDED  -- Red, non-dismissible. Vendor is invisible to customers.
 *                 Action: upload docs if there is a self-service remedy,
 *                 otherwise contact appeals (no dead-end link).
 *   RENEWAL_DUE -- Amber, dismissible once per browser session only.
 *                  Shows the deadline as a date ("3 September 2026"),
 *                  not as a countdown.
 *
 * Edge case: if overallState is SUSPENDED the suspended banner is shown
 * exclusively; the renewal banner is never stacked on top.
 *
 * The /compliance page already has its own verification banners (see
 * compliance-client.tsx VerificationStatusSection). This component adds a
 * surface on the dashboard without moving or replacing anything on /compliance.
 */

import { useEffect, useState } from 'react';

import { cn } from '@feastpot/ui';
import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import Link from 'next/link';

import { useVendorVerification, type VendorVerificationRecord } from '@/hooks/use-vendor-verification';

// ── Constants ────────────────────────────────────────────────────────────────

/** sessionStorage key used to suppress the renewal banner for the rest of the session. */
const RENEWAL_DISMISSED_KEY = 'vb_renewal_dismissed';

const APPEALS_EMAIL = 'appeals@feastpot.co.uk';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true when a suspended vendor has a document-level issue they can
 * resolve themselves by uploading a new file. Returns false when the
 * suspension is driven by an enforcement action or an FHRS rating drop --
 * in those cases the only path is to contact the appeals team.
 */
function hasSelfServiceRemedy(v: VendorVerificationRecord): boolean {
  const now = new Date();
  // Insurance missing or expired
  if (!v.insuranceValidUntil || new Date(v.insuranceValidUntil) < now) return true;
  // Allergen training expired
  if (v.allergenTrainingHeld && v.allergenTrainingUntil && new Date(v.allergenTrainingUntil) < now)
    return true;
  // All documents look current -- this is an enforcement or FHRS suspension
  return false;
}

/**
 * For RENEWAL_DUE banners, find the nearest future expiry date so we can show
 * the vendor a concrete deadline rather than a vague "expiring soon".
 * Returns null if no expiry dates are present on the record.
 */
function nearestExpiryDate(v: VendorVerificationRecord): Date | null {
  const now = new Date();
  const candidates: Date[] = [];
  if (v.insuranceValidUntil) {
    const d = new Date(v.insuranceValidUntil);
    if (d > now) candidates.push(d);
  }
  if (v.allergenTrainingHeld && v.allergenTrainingUntil) {
    const d = new Date(v.allergenTrainingUntil);
    if (d > now) candidates.push(d);
  }
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a < b ? a : b));
}

/** Format a date as "3 September 2026" (British English, unambiguous). */
function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SuspendedBanner({ v }: { v: VendorVerificationRecord }) {
  const selfService = hasSelfServiceRemedy(v);
  const action = selfService
    ? { label: 'Upload your documents', href: '/compliance', external: false }
    : { label: 'Contact the appeals team', href: `mailto:${APPEALS_EMAIL}`, external: true };

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="verification-suspended-banner"
      className="fp-card flex items-start gap-3 border border-red-400 bg-red-50 p-4 text-sm text-red-900"
    >
      <ShieldAlert
        className="mt-0.5 h-5 w-5 shrink-0 text-red-600"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-bold">Your listing is suspended</p>
        <p className="mt-0.5">
          You are not visible to customers and cannot receive new orders.{' '}
          {selfService
            ? 'Upload your renewed documents to restore your listing.'
            : 'This suspension cannot be resolved by uploading documents. Contact our appeals team to discuss next steps.'}
        </p>
      </div>
      <div className="shrink-0 self-center">
        {action.external ? (
          <a
            href={action.href}
            className="whitespace-nowrap rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-800"
          >
            {action.label}
          </a>
        ) : (
          <Link
            href={action.href}
            className="whitespace-nowrap rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-800"
          >
            {action.label}
          </Link>
        )}
      </div>
    </div>
  );
}

function RenewalDueBanner({ v, onDismiss }: { v: VendorVerificationRecord; onDismiss: () => void }) {
  const deadline = nearestExpiryDate(v);

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="verification-renewal-banner"
      className="fp-card flex items-start gap-3 border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
    >
      <AlertTriangle
        className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-bold">Renewal required: your listing will stop taking orders soon</p>
        <p className="mt-0.5">
          {deadline
            ? `One or more verification documents expire on ${fmtDate(deadline)}. Upload renewed documents before that date to keep your listing live.`
            : 'One or more verification documents are expiring soon. Upload renewed documents to keep your listing live.'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-center">
        <Link
          href="/compliance"
          className="whitespace-nowrap rounded-md bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-800"
        >
          Upload documents
        </Link>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss renewal reminder"
          data-testid="renewal-dismiss"
          className={cn(
            'rounded-md p-1 text-amber-700 transition-colors hover:bg-amber-200',
          )}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  vendorId: string;
}

export function VerificationStateBanner({ vendorId }: Props) {
  // sessionStorage is not available during SSR; mount before reading it.
  const [mounted, setMounted] = useState(false);
  const [renewalDismissed, setRenewalDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    setRenewalDismissed(sessionStorage.getItem(RENEWAL_DISMISSED_KEY) === '1');
  }, []);

  const { data: verification, isLoading } = useVendorVerification(vendorId);

  // Don't flash anything while data or mount state is not ready.
  if (!mounted || isLoading || !verification) return null;

  const state = verification.overallState;

  if (state === 'SUSPENDED') {
    return <SuspendedBanner v={verification} />;
  }

  if (state === 'RENEWAL_DUE' && !renewalDismissed) {
    return (
      <RenewalDueBanner
        v={verification}
        onDismiss={() => {
          sessionStorage.setItem(RENEWAL_DISMISSED_KEY, '1');
          setRenewalDismissed(true);
        }}
      />
    );
  }

  return null;
}
