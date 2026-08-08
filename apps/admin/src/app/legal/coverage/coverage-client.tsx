'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@feastpot/ui';
import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { StatusPill } from '@/components/ui/status-pill';
import { useAdminCoverage, type DocType } from '@/hooks/use-legal';
import { formatDate } from '@/lib/format';

const DOC_TYPES: { value: DocType; label: string }[] = [
  { value: 'VENDOR_TERMS', label: 'Vendor terms' },
  { value: 'CUSTOMER_TERMS', label: 'Customer terms' },
  { value: 'PRIVACY', label: 'Privacy policy' },
  { value: 'COOKIES', label: 'Cookie policy' },
];

export function CoverageClient() {
  const [docType, setDocType] = useState<DocType>('VENDOR_TERMS');
  const [onlyBehind, setOnlyBehind] = useState(false);
  const { data, isLoading, refetch } = useAdminCoverage(docType, onlyBehind);

  const pct = data?.coveragePct ?? 100;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Acceptance coverage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every active vendor and whether they have accepted the current live version. This number
          should be 100 at all times.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value as DocType)}
          className="fp-admin-input"
        >
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyBehind}
            onChange={(e) => setOnlyBehind(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Show only vendors not on current version
        </label>
      </div>

      {/* Summary card */}
      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-5">
              <div
                className={`text-4xl font-bold tabular-nums ${
                  pct === 100 ? 'text-green-600' : pct >= 95 ? 'text-amber-500' : 'text-destructive'
                }`}
              >
                {pct}%
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Coverage</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : pct >= 95 ? 'bg-amber-400' : 'bg-destructive'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-3xl font-bold tabular-nums">{data.totalActive}</div>
              <p className="mt-1 text-xs text-muted-foreground">Active vendors</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="text-3xl font-bold tabular-nums text-green-600">{data.onCurrentCount}</div>
              <p className="mt-1 text-xs text-muted-foreground">On current version</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className={`text-3xl font-bold tabular-nums ${data.totalActive - data.onCurrentCount > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                {data.totalActive - data.onCurrentCount}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Behind current version</p>
              {data.liveVersion && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Current: v{data.liveVersion.version} effective {formatDate(data.liveVersion.effectiveAt)}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Vendor table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {onlyBehind ? 'Vendors not on current version' : 'All active vendors'}
            {data && ` (${data.vendors.length})`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading...</p>
          ) : data?.vendors.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" aria-hidden />
              <p className="text-sm font-semibold text-green-700">
                All active vendors are on the current version
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pl-4 text-left font-semibold">Vendor</th>
                  <th className="py-2 text-left font-semibold">Status</th>
                  <th className="py-2 text-left font-semibold">On current?</th>
                  <th className="py-2 text-left font-semibold">Accepted version</th>
                  <th className="py-2 text-left font-semibold">Accepted at</th>
                  <th className="py-2 pr-4 text-left font-semibold">Method</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data?.vendors.map((v) => (
                  <tr key={v.vendorId} className="hover:bg-muted/30">
                    <td className="py-2.5 pl-4 font-medium">
                      <Link href={`/vendors/${v.vendorId}`} className="hover:underline">
                        {v.businessName}
                      </Link>
                    </td>
                    <td className="py-2.5">
                      <StatusPill
                        tone={
                          v.vendorStatus === 'live'
                            ? 'success'
                            : v.vendorStatus === 'probation'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {v.vendorStatus}
                      </StatusPill>
                    </td>
                    <td className="py-2.5">
                      {v.onCurrentVersion ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Yes" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" aria-label="No" />
                      )}
                    </td>
                    <td className="py-2.5 font-mono text-muted-foreground">
                      {v.acceptedVersion ? `v${v.acceptedVersion}` : 'Never accepted'}
                    </td>
                    <td className="py-2.5 text-muted-foreground">
                      {v.acceptedAt ? formatDate(v.acceptedAt) : '-'}
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{v.method ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
