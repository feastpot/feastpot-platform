'use client';

import { Card, CardContent } from '@feastpot/ui';
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
 * Dashboard widget. Stays muted/quiet when everything is approved, and
 * escalates colour/copy when something needs attention. Always links to
 * the full `/compliance` tab.
 */
export function ComplianceAlerts({ vendorId }: { vendorId: string }) {
  const docs = useVendorDocuments(vendorId);
  if (docs.isLoading || !docs.data) return null;

  const summary = summarise(REQUIRED_DOC_TYPES, docs.data);
  const allGood = summary.worst === 'approved';
  const meta = COMPLIANCE_STATE_META[summary.worst];

  const tone =
    meta.tone === 'red'
      ? 'border-red-300 bg-red-50'
      : meta.tone === 'amber'
      ? 'border-amber-300 bg-amber-50'
      : meta.tone === 'teal'
      ? 'border-teal/40 bg-teal/5'
      : 'border-border bg-card';

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

  const items = summary.byType
    .filter((r) => NEEDS_ATTENTION.includes(r.state))
    .slice(0, 3);

  return (
    <Card className={tone}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            {allGood ? (
              <ShieldCheck className="mt-0.5 h-4 w-4 text-teal" />
            ) : (
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 ${
                  meta.tone === 'red' ? 'text-red-700' : 'text-amber-700'
                }`}
              />
            )}
            <div>
              <p className="text-sm font-medium text-dark">{headline}</p>
              {!allGood && items.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                  {items.map((it) => (
                    <li key={it.type}>
                      {DOC_LABELS.get(it.type) ?? it.type}
                      <span className="ml-1 text-foreground/70">
                        ({COMPLIANCE_STATE_META[it.state].label.toLowerCase()})
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {allGood && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  All {summary.totalRequired} required documents are approved.
                </p>
              )}
            </div>
          </div>
          <Link
            href="/compliance"
            className="self-start whitespace-nowrap text-xs font-medium text-vendor hover:underline"
          >
            {allGood ? 'View documents' : 'Take action'}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
