'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@feastpot/ui';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';

import { StatusPill } from '@/components/ui/status-pill';
import { useAdminTermsVersion } from '@/hooks/use-legal';
import { formatDate, formatDateTime } from '@/lib/format';

// ─── Minimal line-diff renderer ──────────────────────────────────────────────

function computeDiff(
  oldText: string,
  newText: string,
): Array<{ kind: 'unchanged' | 'added' | 'removed'; text: string }> {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: Array<{ kind: 'unchanged' | 'added' | 'removed'; text: string }> = [];

  // Simple LCS-based diff (patience-lite: longest common subsequence).
  const m = oldLines.length;
  const n = newLines.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i]![j] =
        oldLines[i] === newLines[j]
          ? 1 + lcs[i + 1]![j + 1]!
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      result.push({ kind: 'unchanged', text: oldLines[i]! });
      i++;
      j++;
    } else if (j < n && (i >= m || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) {
      result.push({ kind: 'added', text: newLines[j]! });
      j++;
    } else {
      result.push({ kind: 'removed', text: oldLines[i]! });
      i++;
    }
  }
  return result;
}

const STATUS_TONE = { live: 'success', pending: 'warning', superseded: 'neutral' } as const;

interface Props {
  id: string;
}

export function DocVersionClient({ id }: Props) {
  const { data: version, isLoading } = useAdminTermsVersion(id);

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>;
  }
  if (!version) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Version not found.</p>;
  }

  const diffLines = version.liveVersion
    ? computeDiff(version.liveVersion.contentMdx, version.contentMdx)
    : null;

  const hasChanges = diffLines ? diffLines.some((l) => l.kind !== 'unchanged') : false;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/legal/documents"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to documents
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {version.documentType.replace(/_/g, ' ')} v{version.version}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Published {formatDateTime(version.publishedAt)} by {version.createdBy}
          </p>
        </div>
        <StatusPill tone={STATUS_TONE[version.status as keyof typeof STATUS_TONE] ?? 'neutral'}>
          {version.status}
        </StatusPill>
      </div>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Version metadata</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Version
              </dt>
              <dd className="mt-0.5 font-mono font-medium">v{version.version}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Effective date
              </dt>
              <dd className="mt-0.5">{formatDate(version.effectiveAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Material change
              </dt>
              <dd className="mt-0.5">
                {version.isMaterial ? (
                  <span className="flex items-center gap-1 text-green-700">
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Yes
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <XCircle className="h-4 w-4" aria-hidden /> No (editorial)
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Content hash (SHA-256)
              </dt>
              <dd className="mt-0.5 font-mono text-xs break-all text-muted-foreground">
                {version.contentHash}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Acceptances
              </dt>
              <dd className="mt-0.5 tabular-nums">{version._count.acceptances}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Notices sent
              </dt>
              <dd className="mt-0.5 tabular-nums">{version._count.notices}</dd>
            </div>
            {version.solicitorSignOff && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Solicitor sign-off
                </dt>
                <dd className="mt-0.5 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
                  <CheckCircle2 className="mr-1.5 inline h-4 w-4 align-text-bottom" aria-hidden />
                  {version.solicitorSignOff}
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>

      {/* Change summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Change summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{version.changeSummary}</p>
        </CardContent>
      </Card>

      {/* Diff vs live version */}
      {version.liveVersion && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Diff vs current live (v{version.liveVersion.version})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!hasChanges ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                Content is identical to the current live version.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <pre className="w-max min-w-full p-4 text-xs leading-5">
                  {diffLines!.map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.kind === 'added'
                          ? 'bg-green-50 text-green-800'
                          : line.kind === 'removed'
                            ? 'bg-red-50 text-red-800 line-through'
                            : 'text-muted-foreground'
                      }
                    >
                      <span className="mr-2 select-none opacity-50">
                        {line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}
                      </span>
                      {line.text || '\u00a0'}
                    </div>
                  ))}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Full content */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Full content</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <pre className="overflow-x-auto p-4 text-xs leading-5 text-foreground">
            {version.contentMdx}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
