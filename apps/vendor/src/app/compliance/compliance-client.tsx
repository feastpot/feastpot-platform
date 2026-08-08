'use client';

import { cn } from '@feastpot/ui';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

import {
  DocumentRow,
  REQUIRED_DOCS,
  REQUIRED_DOC_TYPES,
} from '@/components/compliance/compliance-docs';
import { summarise } from '@/components/compliance/compliance-status';
import { useToast } from '@/components/ui/toaster';
import {
  useUploadDocument,
  useVendorDocuments,
  type VendorDocument,
  type VendorDocumentType,
} from '@/hooks/use-vendor-documents';

// ── Verification types ────────────────────────────────────────────────

export type FhrsInspectionStatus =
  | 'AWAITING_FIRST_INSPECTION'
  | 'RATED'
  | 'EXEMPT'
  | 'NOT_FOUND';

export type VerificationState = 'VERIFIED' | 'RENEWAL_DUE' | 'SUSPENDED';

export interface VerificationRecord {
  id: string;
  vendorId: string;
  registrationNumber: string;
  registrationAuthority: string;
  registrationConfirmedAt: string;
  fhrsRating: number | null;
  fhrsRatingCheckedAt: string | null;
  fhrsInspectionStatus: FhrsInspectionStatus;
  insuranceProvider: string | null;
  insuranceValidUntil: string | null;
  allergenTrainingHeld: boolean;
  allergenTrainingUntil: string | null;
  idVerifiedAt: string | null;
  overallState: VerificationState;
  updatedAt: string;
}

interface VendorSummary {
  id: string;
  businessName: string;
  status: 'pending' | 'approved' | 'live' | 'suspended' | 'probation' | 'removed';
}

/**
 * Vendor-facing compliance hub - redesigned to match the Vendor4
 * mockup while preserving every existing behaviour:
 *   - same useVendorDocuments + useUploadDocument hooks
 *   - same REQUIRED_DOCS source of truth (shared with onboarding)
 *   - same `summarise()` / `deriveComplianceState()` helpers, so the
 *     dashboard widget and this page can never disagree
 *   - same suspended / probation account banners
 *
 * Layout (top → bottom):
 *   [header - title + subtitle]
 *   [suspension banner (only if status === 'suspended')]
 *   [verification status section (if record exists) - read-only]
 *   [top status banner - message + counts + approval progress bar +
 *    "View missing" CTA]
 *   [4 doc cards - icon tile + meta + Expires + Upload + state badge +
 *    requirements checklist, left bar tinted by state]
 *   [footer info - review SLA + replace-reset copy]
 */
export function ComplianceClient({
  vendor,
  verification,
}: {
  vendor: VendorSummary;
  verification: VerificationRecord | null;
}) {
  const docs = useVendorDocuments(vendor.id);
  const upload = useUploadDocument(vendor.id);
  const { toast } = useToast();

  const summary = summarise(REQUIRED_DOC_TYPES, docs.data);
  // Newest-first per type - API returns docs ordered by createdAt desc,
  // so the first occurrence wins. `new Map(arr)` would silently keep
  // the LAST (oldest) entry after a re-upload, so we iterate manually.
  const docByType = new Map<VendorDocumentType, VendorDocument>();
  for (const d of docs.data ?? []) if (!docByType.has(d.type)) docByType.set(d.type, d);

  const approvedPct =
    summary.totalRequired === 0 ? 0 : Math.round((summary.approved / summary.totalRequired) * 100);

  // Scroll the first non-approved doc into view when the vendor clicks
  // "View missing". Anchors are per-doc-type so the link works even
  // after re-orderings or deletions further down the list.
  const firstMissingType = summary.byType.find((b) => b.state !== 'approved')?.type ?? null;
  const handleViewMissing = () => {
    if (!firstMissingType) return;
    const el = document.getElementById(`doc-${firstMissingType}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const worst = summary.worst;
  const allGood = worst === 'approved';
  const banner = describeBanner(summary, allGood);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-dark">
            Compliance & documents
          </h1>
          <p className="mt-1 text-sm text-mid">
            Keep your certificates current to stay live on FeastPot. We send you a reminder 30 days
            before anything expires.
          </p>
        </div>
        {vendor.status === 'suspended' && (
          <span className="inline-flex items-center rounded-full border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-800">
            Account suspended
          </span>
        )}
        {vendor.status === 'probation' && (
          <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
            On probation
          </span>
        )}
      </header>

      {/* Suspension banner - shown when an admin has paused the account.
          Kept separate from the status banner below because suspension
          is a vendor-level state, not a per-doc state. */}
      {vendor.status === 'suspended' && (
        <div className="fp-card flex items-start gap-3 border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Your account is currently suspended.</p>
            <p className="text-red-800">
              New orders are paused while compliance reviews your documents. Reply to the email you
              received, or contact support if you need help.
            </p>
          </div>
        </div>
      )}

      {/* Verification status - read-only; shown whenever the compliance
          team has created a verification record for this vendor. */}
      {verification && <VerificationStatusSection verification={verification} />}

      {docs.isLoading ? (
        /* Loading state: skeleton cards while document list fetches */
        <div className="space-y-3" aria-busy="true" aria-label="Loading compliance documents">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-24 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      ) : docs.isError ? (
        /* Error state: fetch failed */
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <p className="font-semibold">Could not load your compliance documents.</p>
          <p className="mt-1 text-red-700">Please refresh the page to try again.</p>
        </div>
      ) : (
        <>
          <StatusBanner
            tone={banner.tone}
            title={banner.title}
            subline={banner.subline}
            approvedPct={approvedPct}
            canViewMissing={!!firstMissingType}
            onViewMissing={handleViewMissing}
          />

          <div className="space-y-3">
            {REQUIRED_DOCS.map((d) => (
              <DocumentRow
                key={d.type}
                anchorId={`doc-${d.type}`}
                type={d.type}
                label={d.label}
                why={d.why}
                mustShow={d.mustShow}
                acceptedFiles={d.acceptedFiles}
                doc={docByType.get(d.type) ?? null}
                uploading={upload.isPending}
                onPick={(file, expiresAt) => {
                  upload.mutate(
                    { file, type: d.type, expiresAt },
                    {
                      onSuccess: () => toast({ title: `${d.label} uploaded` }),
                      onError: (err) =>
                        toast({
                          title: 'Upload failed',
                          description: err instanceof Error ? err.message : '',
                          variant: 'destructive',
                        }),
                    },
                  );
                }}
              />
            ))}
          </div>
        </>
      )}

      <div className="fp-card flex items-start gap-3 border border-border bg-surface px-4 py-3 text-xs text-mid">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-mid" aria-hidden />
        <p>
          Documents are reviewed by the FeastPot compliance team, usually within 1 to 2 business
          days. Replacing a document resets it to <em>Submitted</em> until it&apos;s reviewed again.
        </p>
      </div>
    </div>
  );
}

// ── Verification status section ───────────────────────────────────────

/** Returns the number of whole days until a date (negative = overdue). */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function DaysTag({ days, label }: { days: number | null; label: string }) {
  if (days === null) return null;
  if (days > 0) {
    const colour =
      days <= 30
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-teal/30 bg-teal-light text-teal-dark';
    return (
      <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', colour)}>
        {days}d remaining
      </span>
    );
  }
  return (
    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
      {label} expired {Math.abs(days)}d ago
    </span>
  );
}

interface VRow {
  icon: 'check' | 'clock' | 'alert';
  label: string;
  value: React.ReactNode;
  deadline?: React.ReactNode;
}

function VIcon({ kind }: { kind: VRow['icon'] }) {
  if (kind === 'check')
    return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />;
  if (kind === 'alert')
    return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />;
  return <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />;
}

function VerificationRow({ icon, label, value, deadline }: VRow) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <VIcon kind={icon} />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold uppercase tracking-[0.1em] text-mid">{label}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-dark">{value}</span>
          {deadline}
        </div>
      </div>
    </div>
  );
}

function VerificationStatusSection({ verification: v }: { verification: VerificationRecord }) {
  const insuranceDays = daysUntil(v.insuranceValidUntil);
  const allergenDays = daysUntil(v.allergenTrainingUntil);

  // ── overall state banner ─────────────────────────────────────────
  const isAlert = v.overallState === 'SUSPENDED' || v.overallState === 'RENEWAL_DUE';
  const bannerProps =
    v.overallState === 'SUSPENDED'
      ? {
          wrap: 'border-red-300 bg-red-50',
          text: 'text-red-900',
          Icon: ShieldAlert,
          iconClass: 'text-red-600',
          title: 'Your Feastpot verification is suspended',
          body: 'One or more verification requirements are no longer met. New orders are paused until compliance clears the issue. Contact compliance@feastpot.co.uk to resolve this.',
        }
      : v.overallState === 'RENEWAL_DUE'
        ? {
            wrap: 'border-amber-300 bg-amber-50',
            text: 'text-amber-900',
            Icon: AlertTriangle,
            iconClass: 'text-amber-600',
            title: 'Action needed: verification renewal due',
            body: 'One or more items are expiring soon or have already expired. Contact compliance@feastpot.co.uk to submit updated documentation.',
          }
        : null;

  // ── hygiene rating row ───────────────────────────────────────────
  let hygieneIcon: VRow['icon'];
  let hygieneValue: React.ReactNode;

  if (v.fhrsInspectionStatus === 'AWAITING_FIRST_INSPECTION') {
    hygieneIcon = 'clock';
    hygieneValue = `Registered with ${v.registrationAuthority}. Awaiting first hygiene inspection.`;
  } else if (v.fhrsInspectionStatus === 'EXEMPT') {
    hygieneIcon = 'check';
    hygieneValue = 'Exempt from FHRS rating (low-risk premises).';
  } else if (v.fhrsInspectionStatus === 'NOT_FOUND') {
    hygieneIcon = 'clock';
    hygieneValue = `Rating lookup pending. Last checked: ${fmtDate(v.fhrsRatingCheckedAt) || 'not yet checked'}.`;
  } else {
    const score = v.fhrsRating;
    const checkedStr = v.fhrsRatingCheckedAt ? ` Checked ${fmtDate(v.fhrsRatingCheckedAt)}.` : '';
    if (score !== null && score >= 3) {
      hygieneIcon = 'check';
      hygieneValue = `${score}/5 hygiene rating.${checkedStr}`;
    } else if (score !== null) {
      hygieneIcon = 'alert';
      hygieneValue = `${score}/5 - below minimum required (3).${checkedStr}`;
    } else {
      hygieneIcon = 'clock';
      hygieneValue = `Rating pending.${checkedStr}`;
    }
  }

  // ── insurance row ────────────────────────────────────────────────
  const insuranceExpired = insuranceDays !== null && insuranceDays <= 0;
  const insuranceIcon: VRow['icon'] = !v.insuranceValidUntil
    ? 'clock'
    : insuranceExpired
      ? 'alert'
      : 'check';
  const insuranceValue = v.insuranceValidUntil
    ? `${v.insuranceProvider ? `${v.insuranceProvider} - ` : ''}Valid until ${fmtDate(v.insuranceValidUntil)}.`
    : 'Awaiting submission.';

  // ── allergen training row ────────────────────────────────────────
  const allergenExpired = allergenDays !== null && allergenDays <= 0;
  const allergenIcon: VRow['icon'] = !v.allergenTrainingHeld
    ? 'clock'
    : allergenExpired
      ? 'alert'
      : 'check';
  const allergenValue = v.allergenTrainingHeld
    ? allergenExpired
      ? `Expired ${fmtDate(v.allergenTrainingUntil)}. Renewal required.`
      : `Completed${v.allergenTrainingUntil ? `, valid until ${fmtDate(v.allergenTrainingUntil)}` : ''}.`
    : 'Training pending.';

  // ── identity row ─────────────────────────────────────────────────
  const idIcon: VRow['icon'] = v.idVerifiedAt ? 'check' : 'clock';
  const idValue = v.idVerifiedAt ? `Verified ${fmtDate(v.idVerifiedAt)}.` : 'Pending.';

  const statePill =
    v.overallState === 'VERIFIED'
      ? 'border-teal/30 bg-teal-light text-teal-dark'
      : v.overallState === 'RENEWAL_DUE'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-red-200 bg-red-50 text-red-700';

  const stateLabel =
    v.overallState === 'VERIFIED'
      ? 'Verified'
      : v.overallState === 'RENEWAL_DUE'
        ? 'Renewal due'
        : 'Suspended';

  return (
    <section aria-label="Feastpot verification status" className="space-y-3">
      {/* Prominent alert banner for RENEWAL_DUE / SUSPENDED */}
      {isAlert && bannerProps && (
        <div
          className={cn(
            'fp-card flex items-start gap-3 border p-4 text-sm',
            bannerProps.wrap,
            bannerProps.text,
          )}
        >
          <bannerProps.Icon
            className={cn('mt-0.5 h-4 w-4 shrink-0', bannerProps.iconClass)}
            aria-hidden
          />
          <div>
            <p className="font-semibold">{bannerProps.title}</p>
            <p className="mt-0.5 opacity-90">{bannerProps.body}</p>
          </div>
        </div>
      )}

      {/* Verification record card */}
      <div className="fp-card border border-border bg-white p-4">
        {/* Header */}
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-teal" aria-hidden />
            <span className="text-[13px] font-extrabold text-dark">Verified by Feastpot</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] font-bold',
                statePill,
              )}
            >
              {stateLabel}
            </span>
            <span className="text-[11px] text-mid">
              Updated {fmtDate(v.updatedAt)}
            </span>
          </div>
        </div>

        <div className="divide-y divide-cream-deep">
          {/* Food business registration */}
          <VerificationRow
            icon="check"
            label="Food business registration"
            value={`${v.registrationAuthority} (${v.registrationNumber}) - confirmed ${fmtDate(v.registrationConfirmedAt)}.`}
          />

          {/* Hygiene rating */}
          <VerificationRow
            icon={hygieneIcon}
            label="Hygiene rating (FHRS)"
            value={hygieneValue}
          />

          {/* Public liability insurance */}
          <VerificationRow
            icon={insuranceIcon}
            label="Public liability insurance"
            value={insuranceValue}
            deadline={
              v.insuranceValidUntil ? (
                <DaysTag days={insuranceDays} label="Insurance" />
              ) : undefined
            }
          />

          {/* Allergen training */}
          <VerificationRow
            icon={allergenIcon}
            label="Allergen training"
            value={allergenValue}
            deadline={
              v.allergenTrainingUntil ? (
                <DaysTag days={allergenDays} label="Allergen training" />
              ) : undefined
            }
          />

          {/* Identity check */}
          <VerificationRow
            icon={idIcon}
            label="Identity check"
            value={idValue}
          />
        </div>

        {/* Read-only note */}
        <p className="mt-3 text-[11px] text-mid">
          This record is maintained by the FeastPot compliance team. To update any detail or submit
          new documentation, email{' '}
          <a
            href="mailto:compliance@feastpot.co.uk"
            className="font-semibold text-teal underline underline-offset-2 hover:text-teal-dark"
          >
            compliance@feastpot.co.uk
          </a>
          .
        </p>
      </div>
    </section>
  );
}

// ── Document status banner ────────────────────────────────────────────

type BannerTone = 'good' | 'attention' | 'warning' | 'neutral';

function describeBanner(summary: ReturnType<typeof summarise>, allGood: boolean) {
  if (allGood) {
    return {
      tone: 'good' as BannerTone,
      title: 'Everything is up to date.',
      subline: `${summary.approved} of ${summary.totalRequired} approved.`,
    };
  }
  const worst = summary.worst;
  const title =
    worst === 'expired'
      ? 'You have documents that have expired.'
      : worst === 'needs_changes'
        ? 'Compliance needs you to re-upload a document.'
        : worst === 'expiring_soon'
          ? 'A document is expiring within 30 days.'
          : worst === 'submitted'
            ? 'Compliance is reviewing your documents.'
            : 'Some documents are missing.';
  const parts: string[] = [`${summary.approved} of ${summary.totalRequired} approved`];
  if (summary.notStarted > 0) parts.push(`${summary.notStarted} not started`);
  if (summary.submitted > 0) parts.push(`${summary.submitted} awaiting review`);
  if (summary.expiringSoon > 0) parts.push(`${summary.expiringSoon} expiring soon`);
  if (summary.expired > 0) parts.push(`${summary.expired} expired`);
  if (summary.needsChanges > 0) parts.push(`${summary.needsChanges} need changes`);
  const subline = `${parts.join(', ')}.`;
  const tone: BannerTone =
    worst === 'expired' || worst === 'needs_changes'
      ? 'warning'
      : worst === 'expiring_soon'
        ? 'attention'
        : 'neutral';
  return { tone, title, subline };
}

function StatusBanner({
  tone,
  title,
  subline,
  approvedPct,
  canViewMissing,
  onViewMissing,
}: {
  tone: BannerTone;
  title: string;
  subline: string;
  approvedPct: number;
  canViewMissing: boolean;
  onViewMissing: () => void;
}) {
  const wrap =
    tone === 'good'
      ? 'border-teal/40 bg-teal-light'
      : tone === 'warning'
        ? 'border-red-200 bg-red-50'
        : tone === 'attention'
          ? 'border-amber-200 bg-amber-50'
          : 'border-teal-light bg-teal-light/40';
  const iconClass =
    tone === 'good'
      ? 'text-teal'
      : tone === 'warning'
        ? 'text-red-600'
        : tone === 'attention'
          ? 'text-amber-600'
          : 'text-teal';
  const pctClass =
    tone === 'good'
      ? 'text-teal-dark'
      : tone === 'warning'
        ? 'text-red-700'
        : tone === 'attention'
          ? 'text-amber-700'
          : 'text-teal-dark';
  const barFill =
    tone === 'good'
      ? 'bg-teal'
      : tone === 'warning'
        ? 'bg-red-500'
        : tone === 'attention'
          ? 'bg-amber-500'
          : 'bg-teal';
  const Icon = tone === 'good' ? ShieldCheck : AlertTriangle;

  return (
    <div className={cn('fp-card border p-4', wrap)}>
      <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_auto_auto]">
        <div className="flex items-start gap-3">
          <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconClass)} aria-hidden />
          <div className="min-w-0">
            <p className="text-sm font-bold text-dark">{title}</p>
            <p className="mt-0.5 text-xs text-mid">{subline}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 md:min-w-[260px]">
          <div className="hidden text-xs font-semibold text-mid md:block">Approval progress</div>
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-white/70"
            role="progressbar"
            aria-valuenow={approvedPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Approval progress"
          >
            <div
              className={cn('h-full rounded-full transition-all', barFill)}
              style={{ width: `${approvedPct}%` }}
            />
          </div>
          <span className={cn('text-sm font-bold tabular-nums', pctClass)}>{approvedPct}%</span>
        </div>
        <button
          type="button"
          onClick={onViewMissing}
          disabled={!canViewMissing}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-white px-3 text-xs font-semibold text-dark transition-colors hover:bg-surface disabled:opacity-60"
        >
          View missing
        </button>
      </div>
    </div>
  );
}
