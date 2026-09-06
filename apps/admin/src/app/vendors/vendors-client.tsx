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
import { Store } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { TabPills, type TabPillItem } from '@/components/ui/tab-pills';
import {
  useAdminVendorCounts,
  useAdminVendors,
  type DocumentStatus,
  type DocumentType,
  type VendorStatus,
} from '@/hooks/use-admin-vendors';
import { formatDate } from '@/lib/format';

type TabValue = VendorStatus | 'all';

const TABS: ReadonlyArray<{
  value: TabValue;
  label: string;
  tone: TabPillItem<TabValue>['countTone'];
}> = [
  { value: 'pending', label: 'Pending', tone: 'warning' },
  { value: 'approved', label: 'Approved', tone: 'info' },
  { value: 'live', label: 'Live', tone: 'success' },
  { value: 'probation', label: 'Probation', tone: 'warning' },
  { value: 'suspended', label: 'Suspended', tone: 'danger' },
  { value: 'removed', label: 'Removed', tone: 'neutral' },
  { value: 'all', label: 'All', tone: 'neutral' },
];

const DOC_TYPES: DocumentType[] = [
  'hygiene_cert',
  'insurance',
  'photo_id',
  'bank_details',
  'kitchen_reg',
];
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

const STATUS_LABEL: Record<VendorStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  live: 'Live',
  probation: 'Probation',
  suspended: 'Suspended',
  removed: 'Removed',
};

export function VendorsClient({ canIncludeTestData }: { canIncludeTestData: boolean }) {
  const [tab, setTab] = useState<TabValue>('all');
  const [includeTestData, setIncludeTestData] = useState(false);
  // Public list endpoint is hard-locked to `live`, so the "all" tab still hits
  // /admin/vendors and just doesn't pass a status filter (server falls back).
  const { data, isLoading, error } = useAdminVendors(tab === 'all' ? 'all' : tab, includeTestData);
  const counts = useAdminVendorCounts(includeTestData);

  const rows = data?.data ?? [];

  const tabItems: ReadonlyArray<TabPillItem<TabValue>> = TABS.map((t) => ({
    value: t.value,
    label: t.label,
    // Counters come from a dedicated /admin/vendors/counts endpoint so every
    // pill shows a number, not just the active tab.
    count: counts.data ? counts.data[t.value] : undefined,
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
        {canIncludeTestData && (
          <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeTestData}
              onChange={(e) => setIncludeTestData(e.target.checked)}
            />
            Include persisted test data
          </label>
        )}
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
                    {v.isTestData && (
                      <Badge
                        variant="outline"
                        className="mt-1"
                        aria-label={`Test data: ${v.testDataProvenance.join('; ')}`}
                      >
                        Test data
                      </Badge>
                    )}
                    {v.cuisines.length > 0 && (
                      <div className="text-xs text-muted-foreground">{v.cuisines.join(', ')}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {`${v.owner.firstName ?? ''} ${v.owner.lastName ?? ''}`.trim() && (
                      <div className="text-sm">
                        {`${v.owner.firstName ?? ''} ${v.owner.lastName ?? ''}`.trim()}
                      </div>
                    )}
                    {v.owner.email && (
                      <div className="text-xs text-muted-foreground">{v.owner.email}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(v.createdAt)}</TableCell>
                  <TableCell>
                    <StatusPill tone={STATUS_TONE[v.status]}>{STATUS_LABEL[v.status]}</StatusPill>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-x-2 gap-y-1">
                      {DOC_TYPES.map((t) => (
                        <DocIcon key={t} type={t} status={v.documentStatusByType[t]} />
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/vendors/${v.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                    >
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
  if (!status) {
    return (
      <span
        title={`${label}: missing`}
        aria-label={`${label}: missing`}
        className="text-xs text-muted-foreground"
      >
        {label}: Missing
      </span>
    );
  }
  if (status === 'verified') {
    return (
      <span
        title={`${label}: present`}
        aria-label={`${label}: present`}
        className="text-xs text-teal-dark"
      >
        {label}: Present
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span
        title={`${label}: rejected`}
        aria-label={`${label}: rejected`}
        className="text-xs text-destructive"
      >
        {label}: Rejected
      </span>
    );
  }
  if (status === 'expired') {
    return (
      <span
        title={`${label}: expired`}
        aria-label={`${label}: expired`}
        className="text-xs text-orange-500"
      >
        {label}: Expired
      </span>
    );
  }
  return (
    <span
      title={`${label}: pending review`}
      aria-label={`${label}: pending review`}
      className="text-xs text-amber-500"
    >
      {label}: Pending
    </span>
  );
}
