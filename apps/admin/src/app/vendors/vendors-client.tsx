'use client';

import {
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@feastpot/ui';
import { Check, Circle, Minus, Store, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { TabPills, type TabPillItem } from '@/components/ui/tab-pills';
import {
  useAdminVendors,
  type DocumentStatus,
  type DocumentType,
  type VendorStatus,
} from '@/hooks/use-admin-vendors';
import { formatDate } from '@/lib/format';

type TabValue = VendorStatus | 'all';

const TABS: ReadonlyArray<{ value: TabValue; label: string; tone: TabPillItem<TabValue>['countTone'] }> = [
  { value: 'pending', label: 'Pending', tone: 'warning' },
  { value: 'live', label: 'Live', tone: 'success' },
  { value: 'probation', label: 'Probation', tone: 'warning' },
  { value: 'suspended', label: 'Suspended', tone: 'danger' },
  { value: 'removed', label: 'Removed', tone: 'neutral' },
  { value: 'all', label: 'All', tone: 'neutral' },
];

const DOC_TYPES: DocumentType[] = ['hygiene_cert', 'insurance', 'photo_id', 'bank_details', 'kitchen_reg'];
const DOC_LABELS: Record<DocumentType, string> = {
  hygiene_cert: 'Hygiene',
  insurance: 'Insurance',
  photo_id: 'Photo ID',
  bank_details: 'Bank',
  kitchen_reg: 'Kitchen reg.',
};

const STATUS_TONE: Record<VendorStatus, StatusTone> = {
  pending: 'warning',
  approved: 'info',
  live: 'success',
  probation: 'warning',
  suspended: 'danger',
  removed: 'neutral',
};

export function VendorsClient() {
  const [tab, setTab] = useState<TabValue>('pending');
  // Public list endpoint is hard-locked to `live`, so the "all" tab still hits
  // /admin/vendors and just doesn't pass a status filter (server falls back).
  const { data, isLoading, error } = useAdminVendors(tab === 'all' ? 'all' : tab);

  const rows = data?.data ?? [];

  const tabItems: ReadonlyArray<TabPillItem<TabValue>> = TABS.map((t) => ({
    value: t.value,
    label: t.label,
    // Count reflects the *currently loaded* slice (we don't fetch all states
    // up-front to keep payloads small) so it only shows on the active tab.
    count: t.value === tab ? rows.length : undefined,
    countTone: t.tone,
  }));

  return (
    <>
      <PageHeader title="Vendors" description="Approval queue and lifecycle management." />

      <div className="mb-4">
        <TabPills<TabValue>
          items={tabItems}
          value={tab}
          onChange={setTab}
          ariaLabel="Vendor status filter"
        />
      </div>

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
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="p-0">
                    <EmptyState
                      icon={Store}
                      title="No vendors in this state"
                      description="When vendors are added or updated, they will appear here for review and approval."
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <div className="font-medium">{v.businessName}</div>
                    <div className="text-xs text-muted-foreground">{v.cuisines.join(', ') || '-'}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{`${v.owner.firstName ?? ''} ${v.owner.lastName ?? ''}`.trim() || '-'}</div>
                    <div className="text-xs text-muted-foreground">{v.owner.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(v.createdAt)}</TableCell>
                  <TableCell>
                    <StatusPill tone={STATUS_TONE[v.status]}>{v.status}</StatusPill>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {DOC_TYPES.map((t) => (
                        <DocIcon key={t} type={t} status={v.documentStatusByType[t]} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/vendors/${v.id}`} className="text-sm font-medium text-primary hover:underline">
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
