'use client';

import { cn } from '@feastpot/ui';
import { AlertTriangle, Info, ShieldAlert, ShieldCheck } from 'lucide-react';

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

interface VendorSummary {
  id: string;
  businessName: string;
  status: 'pending' | 'approved' | 'live' | 'suspended' | 'probation' | 'removed';
}

/**
 * Vendor-facing compliance hub — redesigned to match the Vendor4
 * mockup while preserving every existing behaviour:
 *   - same useVendorDocuments + useUploadDocument hooks
 *   - same REQUIRED_DOCS source of truth (shared with onboarding)
 *   - same `summarise()` / `deriveComplianceState()` helpers, so the
 *     dashboard widget and this page can never disagree
 *   - same suspended / probation account banners
 *
 * Layout (top → bottom):
 *   [header — title + subtitle]
 *   [suspension banner (only if status === 'suspended')]
 *   [top status banner — message + counts + approval progress bar +
 *    "View missing" CTA]
 *   [4 doc cards — icon tile + meta + Expires + Upload + state badge +
 *    requirements checklist, left bar tinted by state]
 *   [footer info — review SLA + replace-reset copy]
 */
export function ComplianceClient({ vendor }: { vendor: VendorSummary }) {
  const docs = useVendorDocuments(vendor.id);
  const upload = useUploadDocument(vendor.id);
  const { toast } = useToast();

  const summary = summarise(REQUIRED_DOC_TYPES, docs.data);
  // Newest-first per type — API returns docs ordered by createdAt desc,
  // so the first occurrence wins. `new Map(arr)` would silently keep
  // the LAST (oldest) entry after a re-upload, so we iterate manually.
  const docByType = new Map<VendorDocumentType, VendorDocument>();
  for (const d of docs.data ?? []) if (!docByType.has(d.type)) docByType.set(d.type, d);

  const approvedPct =
    summary.totalRequired === 0
      ? 0
      : Math.round((summary.approved / summary.totalRequired) * 100);

  // Scroll the first non-approved doc into view when the vendor clicks
  // "View missing". Anchors are per-doc-type so the link works even
  // after re-orderings or deletions further down the list.
  const firstMissingType =
    summary.byType.find((b) => b.state !== 'approved')?.type ?? null;
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
          <h1 className="text-2xl font-extrabold tracking-tight text-dark">Compliance & documents</h1>
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

      {/* Suspension banner — shown when an admin has paused the account.
          Kept separate from the status banner below because suspension
          is a vendor-level state, not a per-doc state. */}
      {vendor.status === 'suspended' && (
        <div className="fp-card flex items-start gap-3 border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Your account is currently suspended.</p>
            <p className="text-red-800">
              New orders are paused while compliance reviews your documents. Reply to the email
              you received, or contact support if you need help.
            </p>
          </div>
        </div>
      )}

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

// ── Status banner ────────────────────────────────────────────────────

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
          : 'border-vendor-light bg-vendor-light/40';
  const iconClass =
    tone === 'good'
      ? 'text-teal'
      : tone === 'warning'
        ? 'text-red-600'
        : tone === 'attention'
          ? 'text-amber-600'
          : 'text-vendor';
  const pctClass =
    tone === 'good'
      ? 'text-teal-dark'
      : tone === 'warning'
        ? 'text-red-700'
        : tone === 'attention'
          ? 'text-amber-700'
          : 'text-vendor-dark';
  const barFill =
    tone === 'good'
      ? 'bg-teal'
      : tone === 'warning'
        ? 'bg-red-500'
        : tone === 'attention'
          ? 'bg-amber-500'
          : 'bg-vendor';
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
            <div className={cn('h-full rounded-full transition-all', barFill)} style={{ width: `${approvedPct}%` }} />
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
