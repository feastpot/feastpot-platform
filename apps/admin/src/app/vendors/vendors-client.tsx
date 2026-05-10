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
  Tabs,
  TabsList,
  TabsTrigger,
} from '@feastpot/ui';
import { Check, Circle, Minus, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import {
  useAdminVendors,
  type DocumentStatus,
  type DocumentType,
  type VendorStatus,
} from '@/hooks/use-admin-vendors';
import { formatDate } from '@/lib/format';

const TABS: { value: VendorStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'live', label: 'Live' },
  { value: 'probation', label: 'Probation' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'removed', label: 'Removed' },
  { value: 'all', label: 'All' },
];

const DOC_TYPES: DocumentType[] = ['hygiene_cert', 'insurance', 'photo_id', 'bank_details', 'kitchen_reg'];
const DOC_LABELS: Record<DocumentType, string> = {
  hygiene_cert: 'Hygiene',
  insurance: 'Insurance',
  photo_id: 'Photo ID',
  bank_details: 'Bank',
  kitchen_reg: 'Kitchen reg.',
};

export function VendorsClient() {
  const [tab, setTab] = useState<VendorStatus | 'all'>('pending');
  // Public list endpoint is hard-locked to `live`, so the "all" tab still hits
  // /admin/vendors and just doesn't pass a status filter (server falls back).
  const { data, isLoading, error } = useAdminVendors(tab === 'all' ? 'all' : tab);

  return (
    <>
      <PageHeader title="Vendors" description="Approval queue and lifecycle management." />

      <Tabs value={tab} onValueChange={(v) => setTab(v as VendorStatus | 'all')} className="mb-4">
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load vendors: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Documents</TableHead>
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
              {!isLoading && (data?.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    No vendors in this state.
                  </TableCell>
                </TableRow>
              )}
              {(data?.data ?? []).map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <div className="font-medium">{v.businessName}</div>
                    <div className="text-xs text-muted-foreground">{v.cuisines.join(', ') || '—'}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{`${v.owner.firstName ?? ''} ${v.owner.lastName ?? ''}`.trim() || '—'}</div>
                    <div className="text-xs text-muted-foreground">{v.owner.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(v.createdAt)}</TableCell>
                  <TableCell><StatusBadge status={v.status} /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {DOC_TYPES.map((t) => (
                        <DocIcon key={t} type={t} status={v.documentStatusByType[t]} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/vendors/${v.id}`} className="text-sm font-medium text-vendor hover:underline">
                      Review
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

function StatusBadge({ status }: { status: VendorStatus }) {
  const styles: Record<VendorStatus, string> = {
    pending: 'bg-amber-100 text-amber-900',
    approved: 'bg-blue-100 text-blue-900',
    live: 'bg-teal-light text-teal-dark',
    probation: 'bg-orange-100 text-orange-900',
    suspended: 'bg-red-100 text-red-900',
    removed: 'bg-muted text-muted-foreground',
  };
  return <Badge className={styles[status]}>{status}</Badge>;
}

function DocIcon({ type, status }: { type: DocumentType; status: DocumentStatus | undefined }) {
  const label = DOC_LABELS[type];
  const common = 'flex h-6 w-6 items-center justify-center rounded-full text-white';
  if (!status) {
    return (
      <span title={`${label}: missing`} className={`${common} bg-muted text-muted-foreground`}>
        <Minus className="h-3 w-3" />
      </span>
    );
  }
  if (status === 'verified') {
    return <span title={`${label}: verified`} className={`${common} bg-teal-dark`}><Check className="h-3 w-3" /></span>;
  }
  if (status === 'rejected') {
    return <span title={`${label}: rejected`} className={`${common} bg-destructive`}><X className="h-3 w-3" /></span>;
  }
  if (status === 'expired') {
    return <span title={`${label}: expired`} className={`${common} bg-orange-500`}><Circle className="h-3 w-3 fill-current" /></span>;
  }
  return <span title={`${label}: pending`} className={`${common} bg-amber-500`}><Circle className="h-3 w-3 fill-current" /></span>;
}
