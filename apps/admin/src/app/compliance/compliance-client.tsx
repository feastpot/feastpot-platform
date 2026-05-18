'use client';

import {
  Badge,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import Link from 'next/link';

import { PageHeader } from '@/components/layout/page-header';
import { useExpiringDocs, type ExpiringDocRow } from '@/hooks/use-expiring-docs';
import { formatDate } from '@/lib/format';

const TYPE_LABELS: Record<string, string> = {
  hygiene_cert: 'Hygiene cert',
  insurance: 'Insurance',
  photo_id: 'Photo ID',
  bank_details: 'Bank details',
  kitchen_reg: 'Kitchen reg.',
};

export function ComplianceClient() {
  const { data, isLoading, error } = useExpiringDocs();

  return (
    <>
      <PageHeader
        title="Compliance expiry"
        description="Verified vendor documents that have already expired or expire within 30 days."
      />

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load expiring documents: {(error as Error).message}
          </CardContent>
        </Card>
      )}

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
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>
              )}
              {!isLoading && (data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">All documents are healthy.</TableCell></TableRow>
              )}
              {(data ?? []).map((d) => (
                <TableRow key={d.id} className={rowTone(d.urgency)}>
                  <TableCell className="font-medium">{d.vendorName}</TableCell>
                  <TableCell className="text-sm">{TYPE_LABELS[d.type] ?? d.type}</TableCell>
                  <TableCell><Badge>{d.status}</Badge></TableCell>
                  <TableCell className="text-sm">{formatDate(d.expiresAt)}</TableCell>
                  <TableCell className="text-right text-sm">
                    {d.daysRemaining === null ? '-' : d.daysRemaining < 0 ? `Expired ${Math.abs(d.daysRemaining)}d ago` : `${d.daysRemaining}d`}
                  </TableCell>
                  <TableCell>
                    <Link href={`/vendors/${d.vendorId}`} className="text-sm font-medium text-vendor hover:underline">
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

function rowTone(urgency: ExpiringDocRow['urgency']): string {
  switch (urgency) {
    case 'expired':
      return 'bg-red-50';
    case 'critical':
      return 'bg-orange-50';
    case 'warning':
      return 'bg-amber-50/60';
    default:
      return '';
  }
}
