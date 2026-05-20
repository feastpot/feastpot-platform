'use client';

import { Badge, Card, CardContent } from '@feastpot/ui';
import { AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';

import {
  DocumentRow,
  REQUIRED_DOCS,
  REQUIRED_DOC_TYPES,
} from '@/components/compliance/compliance-docs';
import {
  COMPLIANCE_STATE_META,
  summarise,
} from '@/components/compliance/compliance-status';
import { useToast } from '@/components/ui/toaster';
import {
  useUploadDocument,
  useVendorDocuments,
} from '@/hooks/use-vendor-documents';

interface VendorSummary {
  id: string;
  businessName: string;
  status: 'pending' | 'approved' | 'live' | 'suspended' | 'probation' | 'removed';
}

/**
 * Vendor-facing compliance hub. Always reachable from the top nav once the
 * vendor is live or on probation. Shows:
 *
 *  - a one-line account banner (Suspended / Probation badges if applicable)
 *  - a roll-up summary card driven by the same `summarise()` helper the
 *    dashboard widget uses, so the two views never disagree
 *  - the full list of required documents with re-upload controls
 */
export function ComplianceClient({ vendor }: { vendor: VendorSummary }) {
  const docs = useVendorDocuments(vendor.id);
  const upload = useUploadDocument(vendor.id);
  const { toast } = useToast();

  const summary = summarise(REQUIRED_DOC_TYPES, docs.data);
  // Newest-first: API returns docs ordered by createdAt desc, so the first
  // occurrence per type is the latest upload. `new Map(arr)` would keep the
  // LAST occurrence (oldest) which would silently show stale state after a
  // re-upload — must iterate explicitly and keep first-win.
  const docByType = new Map<typeof REQUIRED_DOC_TYPES[number], (typeof docs.data extends (infer U)[] | undefined ? U : never)>();
  for (const d of docs.data ?? []) if (!docByType.has(d.type)) docByType.set(d.type, d);

  const worst = summary.worst;
  const worstMeta = COMPLIANCE_STATE_META[worst];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Compliance &amp; documents</h1>
          <p className="text-sm text-muted-foreground">
            Keep your certificates current to stay live on FeastPot. We send you a reminder
            30 days before anything expires.
          </p>
        </div>
        {vendor.status === 'suspended' && (
          <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800">
            Account suspended
          </Badge>
        )}
        {vendor.status === 'probation' && (
          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
            On probation
          </Badge>
        )}
      </header>

      {/* Suspension banner: shown when an admin has paused the account. */}
      {vendor.status === 'suspended' && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-red-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-medium">Your account is currently suspended.</p>
              <p className="text-red-800">
                New orders are paused while compliance reviews your documents. Reply to the email
                you received, or contact support if you need help.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary card. Colour mirrors the worst doc state. */}
      <SummaryCard worst={worst} summary={summary} />

      <div className="space-y-2">
        {REQUIRED_DOCS.map((d) => (
          <DocumentRow
            key={d.type}
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

      <p className="text-xs text-muted-foreground">
        Documents are reviewed by the FeastPot compliance team, usually within 1 to 2 business days.
        Replacing a document resets it to <em>Submitted</em> until it&apos;s reviewed again.
      </p>
    </div>
  );

  function SummaryCard({
    worst,
    summary,
  }: {
    worst: typeof summary.worst;
    summary: ReturnType<typeof summarise>;
  }) {
    const allGood = worst === 'approved';
    const Icon = allGood ? ShieldCheck : AlertTriangle;
    const tone = worstMeta.tone;
    const wrapClass = allGood
      ? 'border-teal/40 bg-teal/5'
      : tone === 'amber'
      ? 'border-amber-300 bg-amber-50'
      : tone === 'red'
      ? 'border-red-300 bg-red-50'
      : 'border-border bg-muted';
    const iconClass = allGood
      ? 'text-teal'
      : tone === 'amber'
      ? 'text-amber-700'
      : tone === 'red'
      ? 'text-red-700'
      : 'text-muted-foreground';

    return (
      <Card className={wrapClass}>
        <CardContent className="flex items-start gap-3 p-4">
          <Icon className={`mt-0.5 h-5 w-5 flex-shrink-0 ${iconClass}`} />
          <div className="flex-1 text-sm">
            <p className="font-medium">
              {allGood
                ? 'Everything is up to date.'
                : worst === 'expired'
                ? 'You have documents that have expired.'
                : worst === 'needs_changes'
                ? 'Compliance needs you to re-upload a document.'
                : worst === 'expiring_soon'
                ? 'A document is expiring within 30 days.'
                : worst === 'submitted'
                ? 'Compliance is reviewing your documents.'
                : 'Some documents are missing.'}
            </p>
            <p className="mt-1 text-muted-foreground">
              {summary.approved} of {summary.totalRequired} approved
              {summary.expiringSoon > 0 && `, ${summary.expiringSoon} expiring soon`}
              {summary.expired > 0 && `, ${summary.expired} expired`}
              {summary.needsChanges > 0 && `, ${summary.needsChanges} need changes`}
              {summary.notStarted > 0 && `, ${summary.notStarted} not started`}
              {summary.submitted > 0 && `, ${summary.submitted} awaiting review`}.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
}
