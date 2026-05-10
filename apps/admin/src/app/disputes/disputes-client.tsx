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
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import {
  useDisputes,
  type DisputeStatus,
  type Severity,
} from '@/hooks/use-disputes';
import { formatDate, formatPence } from '@/lib/format';

const STATUSES: ReadonlyArray<DisputeStatus | 'all'> = [
  'all',
  'open',
  'vendor_contacted',
  'escalated',
  'resolved',
  'closed',
];
const SEVERITIES: ReadonlyArray<Severity | 'all'> = ['all', 'low', 'medium', 'high'];

export function DisputesClient() {
  const [status, setStatus] = useState<DisputeStatus | 'all'>('open');
  const [severity, setSeverity] = useState<Severity | 'all'>('all');
  const { data, isLoading, error } = useDisputes({
    status: status === 'all' ? undefined : status,
    severity: severity === 'all' ? undefined : severity,
  });

  return (
    <>
      <PageHeader title="Disputes" description="Customer-raised issues that require staff resolution." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Select value={status} onValueChange={(v) => setStatus(v as DisputeStatus | 'all')}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Select value={severity} onValueChange={(v) => setSeverity(v as Severity | 'all')}>
            <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

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
                <TableRow><TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && (data?.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={9} className="py-6 text-center text-sm text-muted-foreground">No disputes match these filters.</TableCell></TableRow>
              )}
              {(data?.data ?? []).map((d) => {
                const customerName = `${d.order.customer.firstName ?? ''} ${d.order.customer.lastName ?? ''}`.trim();
                return (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm">{formatDate(d.createdAt)}</TableCell>
                    <TableCell className="text-sm font-mono">{d.order.orderNumber}</TableCell>
                    <TableCell className="text-sm">{d.order.vendor.businessName}</TableCell>
                    <TableCell className="text-sm">{customerName || d.order.customer.email}</TableCell>
                    <TableCell className="text-sm">{d.issueType}</TableCell>
                    <TableCell><SeverityPill severity={d.severity} /></TableCell>
                    <TableCell><StatusPill status={d.status} /></TableCell>
                    <TableCell className="text-right text-sm">{formatPence(d.order.totalPence)}</TableCell>
                    <TableCell>
                      <Link href={`/disputes/${d.id}`} className="text-sm font-medium text-vendor hover:underline">
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

function SeverityPill({ severity }: { severity: Severity }) {
  const styles: Record<Severity, string> = {
    low: 'bg-muted text-muted-foreground',
    medium: 'bg-amber-100 text-amber-900',
    high: 'bg-red-100 text-red-900',
  };
  return <Badge className={styles[severity]}>{severity}</Badge>;
}

function StatusPill({ status }: { status: DisputeStatus }) {
  const styles: Record<DisputeStatus, string> = {
    open: 'bg-blue-100 text-blue-900',
    vendor_contacted: 'bg-purple-100 text-purple-900',
    escalated: 'bg-red-100 text-red-900',
    resolved: 'bg-teal-light text-teal-dark',
    closed: 'bg-muted text-muted-foreground',
  };
  return <Badge className={styles[status]}>{status.replace('_', ' ')}</Badge>;
}
