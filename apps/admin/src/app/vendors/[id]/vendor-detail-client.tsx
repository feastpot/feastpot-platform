'use client';

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
} from '@feastpot/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toaster';
import {
  useAdminVendors,
  useUpdateVendorStatus,
  type DocumentStatus,
  type DocumentType,
  type VendorStatus,
} from '@/hooks/use-admin-vendors';
import { useVendorDetail, useVendorDocuments, useVerifyDocument } from '@/hooks/use-vendor-detail';
import { formatDate, formatDateTime } from '@/lib/format';

function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2">{children}</div>;
}

const DOC_LABELS: Record<DocumentType, string> = {
  hygiene_cert: 'Hygiene certificate',
  insurance: 'Insurance',
  photo_id: 'Photo ID',
  bank_details: 'Bank details',
  kitchen_reg: 'Kitchen registration',
};

const VENDOR_STATUS_TONE: Record<VendorStatus, StatusTone> = {
  pending: 'warning',
  approved: 'info',
  live: 'success',
  probation: 'warning',
  suspended: 'danger',
  removed: 'neutral',
};

const DOC_STATUS_TONE: Record<DocumentStatus, StatusTone> = {
  verified: 'success',
  rejected: 'danger',
  expired: 'warning',
  pending: 'warning',
};

export function VendorDetailClient({ vendorId }: { vendorId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: vendor, isLoading } = useVendorDetail(vendorId);
  const { data: docs } = useVendorDocuments(vendorId);
  const verifyMutation = useVerifyDocument(vendorId);
  const statusMutation = useUpdateVendorStatus(vendorId);
  // Trigger a re-fetch on the queue list when the user navigates back.
  useAdminVendors('pending');

  const [rejecting, setRejecting] = useState<{ id: string; label: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  function approve(documentId: string) {
    verifyMutation.mutate(
      { documentId, status: 'verified' },
      {
        onSuccess: () => toast({ title: 'Document verified' }),
        onError: (err) => toast({ title: 'Verify failed', description: (err as Error).message, variant: 'destructive' }),
      },
    );
  }

  function confirmReject() {
    if (!rejecting || rejectReason.trim().length === 0) return;
    verifyMutation.mutate(
      { documentId: rejecting.id, status: 'rejected', rejectReason },
      {
        onSuccess: () => {
          setRejecting(null);
          setRejectReason('');
          toast({ title: 'Document rejected' });
        },
        onError: (err) => toast({ title: 'Reject failed', description: (err as Error).message, variant: 'destructive' }),
      },
    );
  }

  function changeStatus(status: VendorStatus, reasonCode?: string) {
    statusMutation.mutate(
      { status, reasonCode },
      {
        onSuccess: () => {
          toast({ title: `Vendor → ${status}` });
          router.refresh();
        },
        onError: (err) => toast({ title: 'Status update failed', description: (err as Error).message, variant: 'destructive' }),
      },
    );
  }

  return (
    <>
      <PageHeader
        title={vendor?.businessName ?? 'Vendor'}
        description={vendor ? `Joined ${formatDate(vendor.createdAt)}` : undefined}
        actions={
          <Link href="/vendors" className="text-sm text-muted-foreground hover:underline">
            ← Back to queue
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {isLoading && <div className="text-muted-foreground">Loading…</div>}
            {vendor && (
              <>
                <Field
                  label="Status"
                  value={
                    <StatusPill tone={VENDOR_STATUS_TONE[vendor.status]}>
                      {vendor.status}
                    </StatusPill>
                  }
                />
                <Field label="Slug" value={vendor.slug} />
                <Field label="Cuisines" value={vendor.cuisines.join(', ') || '-'} />
                <Field label="Rating" value={`${vendor.rating.toFixed(2)} (${vendor.ratingCount} reviews)`} />
                <Field label="Commission" value={`${(vendor.commissionBps / 100).toFixed(2)}%`} />
                <Field label="Payouts enabled" value={vendor.payoutsEnabled ? 'Yes' : 'No'} />
                <Field label="Stripe account" value={vendor.stripeAccountId ?? '-'} />
                <Field label="Approved" value={vendor.approvedAt ? formatDateTime(vendor.approvedAt) : '-'} />
                {vendor.suspendedAt && <Field label="Suspended" value={formatDateTime(vendor.suspendedAt)} />}
                {vendor.description && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Description</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{vendor.description}</p>
                  </div>
                )}
                <div className="pt-2">
                  <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Lifecycle</div>
                  <div className="flex flex-wrap gap-2">
                    {vendor.status === 'pending' && (
                      <>
                        <Button size="sm" onClick={() => changeStatus('approved')}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => changeStatus('removed', 'pending_rejected')}>
                          Reject
                        </Button>
                      </>
                    )}
                    {vendor.status === 'approved' && (
                      <Button size="sm" onClick={() => changeStatus('live')}>Go live</Button>
                    )}
                    {vendor.status === 'live' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => changeStatus('suspended', 'manual_suspend')}
                      >
                        Suspend
                      </Button>
                    )}
                    {vendor.status === 'probation' && (
                      <Button size="sm" onClick={() => changeStatus('live', 'reinstated')}>
                        Reinstate
                      </Button>
                    )}
                    {vendor.status === 'suspended' && (
                      <Button
                        size="sm"
                        onClick={() => changeStatus('probation', 'reinstated_to_probation')}
                      >
                        Move to probation
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(docs ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
            )}
            {(docs ?? []).map((d) => (
              <div key={d.id} className="flex items-start justify-between gap-4 rounded-md border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{DOC_LABELS[d.type] ?? d.type}</span>
                    <DocStatusPill status={d.status} />
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{d.fileName}</div>
                  {d.expiresAt && (
                    <div className="mt-0.5 text-xs text-muted-foreground">Expires {formatDate(d.expiresAt)}</div>
                  )}
                  {d.rejectReason && (
                    <div className="mt-1 text-xs text-destructive">Rejected: {d.rejectReason}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Open
                  </a>
                  {d.status !== 'verified' && (
                    <Button size="sm" onClick={() => approve(d.id)} disabled={verifyMutation.isPending}>
                      Verify
                    </Button>
                  )}
                  {d.status !== 'rejected' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRejecting({ id: d.id, label: DOC_LABELS[d.type] });
                        setRejectReason('');
                      }}
                    >
                      Reject
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Reason</label>
            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Document is unreadable…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button onClick={confirmReject} disabled={!rejectReason.trim() || verifyMutation.isPending}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}

function DocStatusPill({ status }: { status: DocumentStatus }) {
  return <StatusPill tone={DOC_STATUS_TONE[status]}>{status}</StatusPill>;
}
