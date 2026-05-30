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
import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { TabPills, type TabPillItem } from '@/components/ui/tab-pills';
import {
  useVendorApplications,
  type VendorApplicationStatus,
} from '@/hooks/use-vendor-applications';
import { formatDate } from '@/lib/format';

type TabValue = VendorApplicationStatus | 'all';

const TABS: ReadonlyArray<{ value: TabValue; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'information_requested', label: 'Information Requested' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export const STATUS_TONE: Record<VendorApplicationStatus, StatusTone> = {
  pending: 'warning',
  under_review: 'info',
  information_requested: 'warning',
  approved: 'success',
  rejected: 'danger',
};

export const STATUS_LABEL: Record<VendorApplicationStatus, string> = {
  pending: 'Pending',
  under_review: 'Under review',
  information_requested: 'Information requested',
  approved: 'Approved',
  rejected: 'Rejected',
};

export function VendorApplicationsClient() {
  const router = useRouter();
  // Default to the in-flight triage queue ("all" → no status filter), matching
  // the backend default and the /admin/vendors "all" tab convention.
  const [tab, setTab] = useState<TabValue>('all');
  const { data, isLoading, error } = useVendorApplications(tab);

  const rows = data ?? [];

  const tabItems: ReadonlyArray<TabPillItem<TabValue>> = TABS.map((t) => ({
    value: t.value,
    label: t.label,
  }));

  return (
    <>
      <PageHeader
        title="Applications"
        description="Pre-account vendor leads awaiting review, approval, or rejection."
      />

      <div className="mb-4">
        <TabPills<TabValue>
          items={tabItems}
          value={tab}
          onChange={setTab}
          ariaLabel="Application status filter"
        />
      </div>

      {error && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Failed to load applications: {(error as Error).message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kitchen</TableHead>
                <TableHead>Applicant</TableHead>
                <TableHead>Cuisine / Kitchen</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>FSA</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={ClipboardList}
                      title="No applications in this state"
                      description="New vendor applications appear here for triage, approval, and onboarding."
                      bordered={false}
                    />
                  </TableCell>
                </TableRow>
              )}
              {rows.map((a) => (
                <TableRow
                  key={a.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/vendor-applications/${a.id}`)}
                >
                  <TableCell>
                    <div className="font-medium">{a.kitchenName}</div>
                    <div className="text-xs text-muted-foreground">{a.postcode}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{a.fullName}</div>
                    <div className="text-xs text-muted-foreground">{a.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{a.cuisineType}</div>
                    <div className="text-xs text-muted-foreground">{a.kitchenType}</div>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(a.createdAt)}</TableCell>
                  <TableCell className="text-sm">{a.hasFsaRegistration ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <StatusPill tone={STATUS_TONE[a.status]}>
                      {STATUS_LABEL[a.status]}
                    </StatusPill>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/vendor-applications/${a.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
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
