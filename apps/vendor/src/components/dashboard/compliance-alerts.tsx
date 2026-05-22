'use client';

import { cn } from '@feastpot/ui';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

import { REQUIRED_DOCS, REQUIRED_DOC_TYPES } from '@/components/compliance/compliance-docs';
import {
  COMPLIANCE_STATE_META,
  summarise,
  type ComplianceState,
} from '@/components/compliance/compliance-status';
import { useVendorDocuments } from '@/hooks/use-vendor-documents';

const DOC_LABELS = new Map(REQUIRED_DOCS.map((d) => [d.type, d.label]));

const NEEDS_ATTENTION: ReadonlyArray<ComplianceState> = [
  'expired',
  'needs_changes',
  'expiring_soon',
  'not_started',
];

/**
 * Dashboard compliance banner.
 *
 * Mirrors the mockup's "4 documents still to upload" callout: a
 * prominent left-icon block with the headline + an inline list of
 * doc names, plus two CTAs on the right ("View all" outlined,
 * "Take action" filled red when there's something to do). When
 * everything is approved the block is muted/quiet but still shows so
 * the vendor gets the green-light reassurance.
 */
export function ComplianceAlerts({ vendorId }: { vendorId: string }) {
  const docs = useVendorDocuments(vendorId);
  if (docs.isLoading || !docs.data) return null;

  const summary = summarise(REQUIRED_DOC_TYPES, docs.data);
  const allGood = summary.worst === 'approved';
  const meta = COMPLIANCE_STATE_META[summary.worst];

  const containerTone =
    meta.tone === 'red'
      ? 'border-brand/30 bg-brand-light/50'
      : meta.tone === 'amber'
        ? 'border-amber-300 bg-amber-50'
        : meta.tone === 'teal'
          ? 'border-teal/30 bg-teal-light/40'
          : 'border-border bg-white';

  const headline = allGood
    ? 'Compliance is up to date'
    : summary.expired > 0
      ? `${summary.expired} document${summary.expired === 1 ? '' : 's'} expired`
      : summary.needsChanges > 0
        ? `${summary.needsChanges} document${summary.needsChanges === 1 ? '' : 's'} need changes`
        : summary.expiringSoon > 0
          ? `${summary.expiringSoon} document${summary.expiringSoon === 1 ? '' : 's'} expiring within 30 days`
          : summary.notStarted > 0
            ? `${summary.notStarted} document${summary.notStarted === 1 ? '' : 's'} still to upload`
            : 'Compliance status';

  const itemsList = summary.byType
    .filter((r) => NEEDS_ATTENTION.includes(r.state))
    .slice(0, 4)
    .map((it) => DOC_LABELS.get(it.type) ?? it.type)
    .join(' · ');

  const statusPill = allGood ? null : meta.label.toLowerCase();

  return (
    <div className={cn('fp-card border p-4', containerTone)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className={cn(
              'grid h-10 w-10 shrink-0 place-items-center rounded-lg',
              allGood ? 'bg-teal-light text-teal' : 'bg-white text-brand',
            )}
          >
            {allGood ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-dark">{headline}</p>
            {!allGood && itemsList.length > 0 ? (
              <p className="mt-1 truncate text-xs text-mid">{itemsList}</p>
            ) : null}
            {allGood && (
              <p className="mt-0.5 text-xs text-mid">
                All {summary.totalRequired} required documents are approved.
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:self-center">
          {statusPill && (
            <span className="hidden text-[11px] font-medium uppercase tracking-wide text-mid sm:inline">
              ({statusPill})
            </span>
          )}
          <Link
            href="/compliance"
            className="rounded-md border border-border bg-white px-3 py-1.5 text-xs font-semibold text-dark transition-colors hover:bg-surface"
          >
            View all
          </Link>
          {!allGood && (
            <Link
              href="/compliance"
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-dark"
            >
              Take action
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
