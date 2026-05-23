'use client';

import {
  Badge,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterCard, FilterField } from '@/components/ui/filter-card';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import {
  useDisputes,
  type DisputeStatus,
  type Severity,
} from '@/hooks/use-disputes';
import { formatDate, formatPence } from '@/lib/format';
import { getSLAStatus, SLA_TONE_CLASSES, type SLAStatus } from '@/lib/sla';

const STATUSES: ReadonlyArray<DisputeStatus | 'all'> = [
  'all',
  'open',
  'vendor_contacted',
  'escalated',
  'resolved',
  'closed',
];
const SEVERITIES: ReadonlyArray<Severity | 'all'> = ['all', 'low', 'medium', 'high'];

const STATUS_TONE: Record<DisputeStatus, StatusTone> = {
  open: 'info',
  vendor_contacted: 'info',
  escalated: 'danger',
  resolved: 'success',
  closed: 'neutral',
};

const SEVERITY_TONE: Record<Severity, StatusTone> = {
  low: 'neutral',
  medium: 'warning',
  high: 'danger',
};

export function DisputesClient() {
  const [status, setStatus] = useState<DisputeStatus | 'all'>('open');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const { data, isLoading, error } = useDisputes({
    status: status === 'all' ? undefined : status,
    severity: severity === 'all' ? undefined : severity,
  });

  // D15: surface SLA breaches first, then oldest open disputes, so the rows
  // most likely to need staff attention appear at the top regardless of the
  // server's default `createdAt desc` ordering.
  const rows = (data?.data ?? [])
    .map((d) => ({ d, sla: getSLAStatus(d.createdAt, d.vendorRespondedAt, d.resolvedAt) }))
    .sort((a, b) => {
      if (a.sla.urgent !== b.sla.urgent) return a.sla.urgent ? -1 : 1;
      return new Date(a.d.createdAt).getTime() - new Date(b.d.createdAt).getTime();
    });

  return (
    <>
      <PageHeader title="Disputes" description="Customer-raised issues that require staff resolution." />

      <FilterCard className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:max-w-md">
          <FilterField label="Status">
            <Select value={status} onValueChange={(v) => setStatus(v as DisputeStatus | 'all')}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Severity">
            <Select value={severity} onValueChange={(v) => setSeverity(v as Severity | 'all')}>
              <SelectTrigger>
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
        </div>
      </FilterCard>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load disputes: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Order total</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={10} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="p-0">
                    <EmptyState
                      icon={AlertTriangle}
                      title="No disputes match these filters"
                      description="All quiet on this front. Try widening filters to see resolved cases."
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map(({ d, sla }) => {
                const customerName = `${d.order.customer.firstName ?? ''} ${d.order.customer.lastName ?? ''}`.trim();
                return (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm">{formatDate(d.createdAt)}</TableCell>
                    <TableCell><SLAPill sla={sla} /></TableCell>
                    <TableCell className="text-sm font-mono">{d.order.orderNumber}</TableCell>
                    <TableCell className="text-sm">{d.order.vendor.businessName}</TableCell>
                    <TableCell className="text-sm">{customerName || d.order.customer.email}</TableCell>
                    <TableCell className="text-sm">{d.issueType}</TableCell>
                    <TableCell>
                      <StatusPill tone={SEVERITY_TONE[d.severity]}>{d.severity}</StatusPill>
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={STATUS_TONE[d.status]}>{d.status.replace('_', ' ')}</StatusPill>
                    </TableCell>
                    <TableCell className="text-right text-sm">{formatPence(d.order.totalPence)}</TableCell>
                    <TableCell>
                      <Link href={`/disputes/${d.id}`} className="text-sm font-medium text-primary hover:underline">
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function SLAPill({ sla }: { sla: SLAStatus }) {
  const tone = SLA_TONE_CLASSES[sla.tone];
  const weight = sla.urgent ? 'font-semibold' : 'font-medium';
  const pulse = sla.urgent ? 'animate-pulse' : '';
  return <Badge className={`${tone} ${weight} ${pulse}`.trim()}>{sla.label}</Badge>;
}
