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
} from '@feastpot/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/page-header';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toaster';
import {
  useResendVendorApplicationInvite,
  useUpdateVendorApplication,
  useVendorApplication,
} from '@/hooks/use-vendor-applications';
import { formatDate, formatDateTime } from '@/lib/format';

import { STATUS_LABEL, STATUS_TONE } from '../vendor-applications-client';

const IN_FLIGHT: ReadonlyArray<string> = ['pending', 'under_review', 'information_requested'];
const REJECTION_MIN = 20;

function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2">{children}</div>;
}

export function VendorApplicationDetailClient({
  id,
  canModerate,
}: {
  id: string;
  canModerate: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: app, isLoading } = useVendorApplication(id);
  const updateMutation = useUpdateVendorApplication(id);
  const resendMutation = useResendVendorApplicationInvite(id);

  const [confirmingApprove, setConfirmingApprove] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [requestingInfo, setRequestingInfo] = useState(false);
  const [infoNotes, setInfoNotes] = useState('');

  const isInFlight = app ? IN_FLIGHT.includes(app.status) : false;

  function approve() {
    updateMutation.mutate(
      { status: 'approved' },
      {
        onSuccess: () => {
          setConfirmingApprove(false);
          toast({ title: 'Application approved', description: 'Vendor provisioned and invite sent.' });
          router.refresh();
        },
        onError: (err) =>
          toast({
            title: 'Approval failed',
            description: (err as Error).message,
            variant: 'destructive',
          }),
      },
    );
  }

  function reject() {
    if (rejectReason.trim().length < REJECTION_MIN) return;
    updateMutation.mutate(
      { status: 'rejected', rejectionReason: rejectReason.trim() },
      {
        onSuccess: () => {
          setRejecting(false);
          setRejectReason('');
          toast({ title: 'Application rejected', description: 'Applicant notified by email.' });
          router.refresh();
        },
        onError: (err) =>
          toast({
            title: 'Rejection failed',
            description: (err as Error).message,
            variant: 'destructive',
          }),
      },
    );
  }

  function requestInfo() {
    if (infoNotes.trim().length === 0) return;
    updateMutation.mutate(
      { status: 'information_requested', adminNotes: infoNotes.trim() },
      {
        onSuccess: () => {
          setRequestingInfo(false);
          setInfoNotes('');
          toast({ title: 'Information requested', description: 'Applicant emailed your notes.' });
          router.refresh();
        },
        onError: (err) =>
          toast({
            title: 'Request failed',
            description: (err as Error).message,
            variant: 'destructive',
          }),
      },
    );
  }

  function resendInvite() {
    resendMutation.mutate(undefined, {
      onSuccess: () => toast({ title: 'Invite resent', description: 'A fresh 7-day magic link is on its way.' }),
      onError: (err) =>
        toast({
          title: 'Resend failed',
          description: (err as Error).message,
          variant: 'destructive',
        }),
    });
  }

  const busy = updateMutation.isPending;

  return (
    <>
      <PageHeader
        title={app?.kitchenName ?? 'Application'}
        description={app ? `Submitted ${formatDate(app.createdAt)}` : undefined}
        actions={
          <Link href="/vendor-applications" className="text-sm text-muted-foreground hover:underline">
            ← Back to applications
          </Link>
        }
      />

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {app && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Applicant + kitchen details */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Application</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
              <Field label="Status" value={<StatusPill tone={STATUS_TONE[app.status]}>{STATUS_LABEL[app.status]}</StatusPill>} />
              <Field label="FSA registration" value={app.hasFsaRegistration ? 'Yes' : 'No'} />
              <Field label="Applicant" value={app.fullName} />
              <Field label="Email" value={app.email} />
              <Field label="Phone" value={app.phone} />
              <Field label="Postcode" value={app.postcode} />
              <Field label="Cuisine type" value={app.cuisineType} />
              <Field label="Kitchen type" value={app.kitchenType} />
              <Field
                label="Instagram"
                value={app.instagram ? app.instagram : '-'}
              />
              <Field label="Marketing consent" value={app.marketingConsent ? 'Yes' : 'No'} />
              <div className="sm:col-span-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Food story</div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{app.foodStory}</p>
              </div>
              <div className="sm:col-span-2">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Terms acceptance</div>
                <p className="mt-1 text-sm">
                  {app.acceptedTermsAt
                    ? `Accepted ${formatDateTime(app.acceptedTermsAt)}${
                        app.acceptedTermsVersion ? ` · version ${app.acceptedTermsVersion}` : ''
                      }`
                    : 'Not recorded (pre-consent submission)'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Review state + actions */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Field
                label="Reviewed by"
                value={
                  app.reviewedBy
                    ? `${`${app.reviewedBy.firstName ?? ''} ${app.reviewedBy.lastName ?? ''}`.trim() || app.reviewedBy.email}`
                    : '-'
                }
              />
              <Field label="Reviewed at" value={app.reviewedAt ? formatDateTime(app.reviewedAt) : '-'} />
              {app.adminNotes && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Admin notes</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{app.adminNotes}</p>
                </div>
              )}
              {app.rejectionReason && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Rejection reason</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-destructive">{app.rejectionReason}</p>
                </div>
              )}
              {app.vendor && (
                <Field
                  label="Provisioned vendor"
                  value={
                    <Link href={`/vendors/${app.vendor.id}`} className="text-primary hover:underline">
                      {app.vendor.businessName}
                    </Link>
                  }
                />
              )}

              {canModerate ? (
                <div className="pt-2">
                  <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Actions</div>
                  <div className="flex flex-wrap gap-2">
                    {isInFlight && (
                      <>
                        <Button size="sm" onClick={() => setConfirmingApprove(true)} disabled={busy}>
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            setRejectReason('');
                            setRejecting(true);
                          }}
                          disabled={busy}
                        >
                          Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setInfoNotes('');
                            setRequestingInfo(true);
                          }}
                          disabled={busy}
                        >
                          Request info
                        </Button>
                      </>
                    )}
                    {app.status === 'approved' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={resendInvite}
                        disabled={resendMutation.isPending}
                      >
                        Resend invite
                      </Button>
                    )}
                    {!isInFlight && app.status !== 'approved' && (
                      <span className="text-xs text-muted-foreground">
                        This application is {STATUS_LABEL[app.status].toLowerCase()} — no further actions.
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="pt-2">
                  <span className="text-xs text-muted-foreground">
                    Read-only — review actions require admin or compliance access.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Approve confirmation */}
      <Dialog open={confirmingApprove} onOpenChange={(open) => !open && setConfirmingApprove(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve this vendor?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 text-sm">
            <p>Approving this vendor will:</p>
            <ul className="space-y-1">
              <li>✓ Create their Supabase auth account</li>
              <li>✓ Create their Vendor record (status: live)</li>
              <li>✓ Send them a portal invite email with a 7-day magic link</li>
            </ul>
            <p className="text-muted-foreground">Are you sure?</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingApprove(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={approve} disabled={busy}>
              {busy ? 'Approving…' : 'Approve vendor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={rejecting} onOpenChange={(open) => !open && setRejecting(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject application</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium" htmlFor="reject-reason">
              Reason (sent to the applicant, min {REJECTION_MIN} characters)
            </label>
            <textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="Explain why this application can't be approved…"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <p className="text-xs text-muted-foreground">
              {rejectReason.trim().length}/{REJECTION_MIN}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={reject}
              disabled={busy || rejectReason.trim().length < REJECTION_MIN}
            >
              {busy ? 'Rejecting…' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request info */}
      <Dialog open={requestingInfo} onOpenChange={(open) => !open && setRequestingInfo(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request more information</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium" htmlFor="info-notes">
              Notes (emailed to the applicant verbatim)
            </label>
            <textarea
              id="info-notes"
              value={infoNotes}
              onChange={(e) => setInfoNotes(e.target.value)}
              rows={4}
              placeholder="Tell the applicant what you need from them…"
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestingInfo(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={requestInfo} disabled={busy || infoNotes.trim().length === 0}>
              {busy ? 'Sending…' : 'Send request'}
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
