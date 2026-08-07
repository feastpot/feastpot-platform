'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  RefreshCcw,
  ShieldCheck,
  ShieldOff,
  ShieldQuestion,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatCard } from '@/components/ui/stat-card';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { useExpiringDocs, type ExpiringDocRow } from '@/hooks/use-expiring-docs';
import { useVerificationSummary } from '@/hooks/use-vendor-verification';
import { formatDate } from '@/lib/format';

const TYPE_LABELS: Record<string, string> = {
  hygiene_cert: 'Hygiene cert',
  insurance: 'Insurance',
  photo_id: 'Photo ID',
  bank_details: 'Bank details',
  kitchen_reg: 'Kitchen reg.',
};

function urgencyTone(u: ExpiringDocRow['urgency']): StatusTone {
  switch (u) {
    case 'expired':
      return 'danger';
    case 'critical':
      return 'warning';
    case 'warning':
      return 'warning';
    default:
      return 'success';
  }
}

export function ComplianceClient() {
  const { data, isLoading, error } = useExpiringDocs();
  const { data: vs, isLoading: vsLoading, error: vsError } = useVerificationSummary();

  const stats = useMemo(() => {
    const rows = data ?? [];
    return {
      total: rows.length,
      expired: rows.filter((r) => r.urgency === 'expired').length,
      critical: rows.filter((r) => r.urgency === 'critical').length,
      warning: rows.filter((r) => r.urgency === 'warning').length,
    };
  }, [data]);

  return (
    <>
      <PageHeader
        title="Compliance"
        description="Monitor vendor compliance, documents and expiry dates."
      />

      {/* ── Verification triage ── */}
      <h2 className="mb-3 text-base font-semibold tracking-tight">Verification status</h2>

      {vsError && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load verification summary: {(vsError as Error).message}
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={ShieldQuestion}
          tone="amber"
          label="Not yet set up"
          value={vsLoading ? '…' : (vs?.counts.notSetUp ?? 0).toString()}
          caption="Live vendors with no verification record"
        />
        <StatCard
          icon={RefreshCcw}
          tone="amber"
          label="Renewal due"
          value={vsLoading ? '…' : (vs?.counts.renewalDue ?? 0).toString()}
          caption="Insurance or training expiring soon"
        />
        <StatCard
          icon={ShieldOff}
          tone="red"
          label="Suspended"
          value={vsLoading ? '…' : (vs?.counts.suspended ?? 0).toString()}
          caption="Listing hidden — action required"
        />
      </div>

      {/* Not yet set up */}
      {(vs?.notSetUp.length ?? 0) > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ShieldQuestion className="h-4 w-4 text-amber-500" />
              Not yet set up ({vs!.notSetUp.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {vs!.notSetUp.map((row) => (
                  <TableRow key={row.vendorId}>
                    <TableCell className="font-medium">{row.vendorName}</TableCell>
                    <TableCell>
                      <Link
                        href={`/vendors/${row.vendorId}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Set up
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Renewal due */}
      {(vs?.renewalDue.length ?? 0) > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <RefreshCcw className="h-4 w-4 text-amber-500" />
              Renewal due ({vs!.renewalDue.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Insurance expires</TableHead>
                  <TableHead>Training expires</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {vs!.renewalDue.map((row) => (
                  <TableRow key={row.vendorId}>
                    <TableCell className="font-medium">{row.vendorName}</TableCell>
                    <TableCell className="text-sm">
                      {row.insuranceValidUntil ? (
                        <StatusPill tone="warning">{formatDate(row.insuranceValidUntil)}</StatusPill>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.allergenTrainingUntil ? (
                        <StatusPill tone="warning">
                          {formatDate(row.allergenTrainingUntil)}
                        </StatusPill>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/vendors/${row.vendorId}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Suspended */}
      {(vs?.suspended.length ?? 0) > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <ShieldOff className="h-4 w-4 text-destructive" />
              Suspended ({vs!.suspended.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {vs!.suspended.map((row) => (
                  <TableRow key={row.vendorId}>
                    <TableCell className="font-medium">{row.vendorName}</TableCell>
                    <TableCell>
                      <Link
                        href={`/vendors/${row.vendorId}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!vsLoading && vs && vs.counts.notSetUp === 0 && vs.counts.renewalDue === 0 && vs.counts.suspended === 0 && (
        <Card className="mb-6">
          <CardContent className="p-0">
            <EmptyState
              icon={ShieldCheck}
              title="All live vendors are verified"
              description="No verification issues found."
              bordered={false}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Expiring documents ── */}
      <h2 className="mb-3 text-base font-semibold tracking-tight">Expiring documents</h2>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load expiring documents: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={ShieldCheck}
          tone="teal"
          label="Tracked documents"
          value={isLoading ? '…' : stats.total.toString()}
          caption="Expiring within 30 days or already expired"
        />
        <StatCard
          icon={CheckCircle2}
          tone="teal"
          label="Approved"
          value={
            isLoading
              ? '…'
              : Math.max(0, stats.total - stats.expired - stats.critical - stats.warning).toString()
          }
          caption="Healthy and not expiring soon"
        />
        <StatCard
          icon={AlertTriangle}
          tone="amber"
          label="Expiring soon"
          value={isLoading ? '…' : (stats.critical + stats.warning).toString()}
          caption="Within 30 days"
        />
        <StatCard
          icon={AlertOctagon}
          tone="red"
          label="Expired"
          value={isLoading ? '…' : stats.expired.toString()}
          caption="Action required"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Days remaining</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={FileCheck2}
                      title="All documents are healthy"
                      description="No vendor documents are expiring within the next 30 days."
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {(data ?? []).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.vendorName}</TableCell>
                  <TableCell className="text-sm">{TYPE_LABELS[d.type] ?? d.type}</TableCell>
                  <TableCell>
                    <StatusPill tone={urgencyTone(d.urgency)}>{d.status}</StatusPill>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(d.expiresAt)}</TableCell>
                  <TableCell className="text-right text-sm">
                    {d.daysRemaining === null
                      ? '-'
                      : d.daysRemaining < 0
                        ? `Expired ${Math.abs(d.daysRemaining)}d ago`
                        : `${d.daysRemaining}d`}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/vendors/${d.vendorId}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
