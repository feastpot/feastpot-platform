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
import {
  useUpdateTrustSignal,
  useVendorDetail,
  useVendorDocuments,
  useVendorTrustSignals,
  useVerifyDocument,
  type TrustSignalStatus,
  type TrustSignalType,
} from '@/hooks/use-vendor-detail';
import {
  useUpsertVerification,
  useVendorVerification,
  type FhrsStatus,
  type UpsertVerificationPayload,
  type VendorVerificationRecord,
  type VerificationState,
} from '@/hooks/use-vendor-verification';
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

const SIGNAL_LABELS: Record<TrustSignalType, string> = {
  food_business_registration: 'Food business registration',
  hygiene_rating: 'Hygiene rating',
  identity_check: 'Identity check',
  allergen_information: 'Allergen information',
  delivery_coverage: 'Delivery coverage',
  event_catering_experience: 'Event catering experience',
  reliable_orders: 'Reliable orders',
};

const SIGNAL_STATUS_TONE: Record<TrustSignalStatus, StatusTone> = {
  verified: 'success',
  submitted: 'warning',
  expired: 'warning',
  not_provided: 'neutral',
};

export function VendorDetailClient({
  vendorId,
  canReviewSignals = false,
}: {
  vendorId: string;
  /** Mirror backend @Roles: only admin/compliance may verify/expire signals. */
  canReviewSignals?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: vendor, isLoading } = useVendorDetail(vendorId);
  const { data: docs } = useVendorDocuments(vendorId);
  const { data: signals } = useVendorTrustSignals(vendorId);
  const signalMutation = useUpdateTrustSignal(vendorId);
  const verifyMutation = useVerifyDocument(vendorId);
  const statusMutation = useUpdateVendorStatus(vendorId);
  // Trigger a re-fetch on the queue list when the user navigates back.
  useAdminVendors('pending');

  const { data: verification, isLoading: verificationLoading } = useVendorVerification(vendorId);
  const upsertVerification = useUpsertVerification(vendorId);

  const [rejecting, setRejecting] = useState<{ id: string; label: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [verifyingSignal, setVerifyingSignal] = useState<{
    signalType: TrustSignalType;
    label: string;
  } | null>(null);
  const [signalEvidence, setSignalEvidence] = useState('');

  // Verification form dialog state
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [vForm, setVForm] = useState<UpsertVerificationPayload>({
    registrationNumber: '',
    registrationAuthority: '',
    registrationConfirmedAt: '',
    fhrsInspectionStatus: 'AWAITING_FIRST_INSPECTION',
    fhrsRating: null,
    fhrsRatingCheckedAt: null,
    insuranceProvider: null,
    insuranceValidUntil: null,
    allergenTrainingHeld: false,
    allergenTrainingUntil: null,
    idVerifiedAt: null,
    overallState: 'VERIFIED',
  });

  function openVerificationDialog(existing: VendorVerificationRecord | null | undefined) {
    if (existing) {
      setVForm({
        registrationNumber: existing.registrationNumber,
        registrationAuthority: existing.registrationAuthority,
        registrationConfirmedAt: existing.registrationConfirmedAt.slice(0, 10),
        fhrsInspectionStatus: existing.fhrsInspectionStatus,
        fhrsRating: existing.fhrsRating,
        fhrsRatingCheckedAt: existing.fhrsRatingCheckedAt?.slice(0, 10) ?? null,
        insuranceProvider: existing.insuranceProvider,
        insuranceValidUntil: existing.insuranceValidUntil?.slice(0, 10) ?? null,
        allergenTrainingHeld: existing.allergenTrainingHeld,
        allergenTrainingUntil: existing.allergenTrainingUntil?.slice(0, 10) ?? null,
        idVerifiedAt: existing.idVerifiedAt?.slice(0, 10) ?? null,
        overallState: existing.overallState,
      });
    } else {
      setVForm({
        registrationNumber: '',
        registrationAuthority: '',
        registrationConfirmedAt: '',
        fhrsInspectionStatus: 'AWAITING_FIRST_INSPECTION',
        fhrsRating: null,
        fhrsRatingCheckedAt: null,
        insuranceProvider: null,
        insuranceValidUntil: null,
        allergenTrainingHeld: false,
        allergenTrainingUntil: null,
        idVerifiedAt: null,
        overallState: 'VERIFIED',
      });
    }
    setVerificationOpen(true);
  }

  function submitVerification() {
    upsertVerification.mutate(vForm, {
      onSuccess: () => {
        setVerificationOpen(false);
        toast({ title: verification ? 'Verification updated' : 'Verification record created' });
      },
      onError: (err) =>
        toast({
          title: 'Save failed',
          description: (err as Error).message,
          variant: 'destructive',
        }),
    });
  }

  function confirmVerifySignal() {
    if (!verifyingSignal) return;
    const evidence = signalEvidence.trim();
    signalMutation.mutate(
      {
        signalType: verifyingSignal.signalType,
        status: 'verified',
        ...(evidence ? { evidenceReference: evidence } : {}),
      },
      {
        onSuccess: () => {
          setVerifyingSignal(null);
          setSignalEvidence('');
          toast({ title: 'Trust signal verified' });
        },
        onError: (err) =>
          toast({
            title: 'Verify failed',
            description: (err as Error).message,
            variant: 'destructive',
          }),
      },
    );
  }

  function expireSignal(signalType: TrustSignalType) {
    signalMutation.mutate(
      { signalType, status: 'expired' },
      {
        onSuccess: () => toast({ title: 'Trust signal expired' }),
        onError: (err) =>
          toast({
            title: 'Expire failed',
            description: (err as Error).message,
            variant: 'destructive',
          }),
      },
    );
  }

  function approve(documentId: string) {
    verifyMutation.mutate(
      { documentId, status: 'verified' },
      {
        onSuccess: () => toast({ title: 'Document verified' }),
        onError: (err) =>
          toast({
            title: 'Verify failed',
            description: (err as Error).message,
            variant: 'destructive',
          }),
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
        onError: (err) =>
          toast({
            title: 'Reject failed',
            description: (err as Error).message,
            variant: 'destructive',
          }),
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
        onError: (err) =>
          toast({
            title: 'Status update failed',
            description: (err as Error).message,
            variant: 'destructive',
          }),
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
                <Field
                  label="Rating"
                  value={`${vendor.rating.toFixed(2)} (${vendor.ratingCount} reviews)`}
                />
                <Field label="Commission" value={`${(vendor.commissionBps / 100).toFixed(2)}%`} />
                <Field label="Payouts enabled" value={vendor.payoutsEnabled ? 'Yes' : 'No'} />
                <Field label="Stripe account" value={vendor.stripeAccountId ?? '-'} />
                <Field
                  label="Approved"
                  value={vendor.approvedAt ? formatDateTime(vendor.approvedAt) : '-'}
                />
                {vendor.suspendedAt && (
                  <Field label="Suspended" value={formatDateTime(vendor.suspendedAt)} />
                )}
                {vendor.description && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Description
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{vendor.description}</p>
                  </div>
                )}
                <div className="pt-2">
                  <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    Lifecycle
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {vendor.status === 'pending' && (
                      <>
                        <Button size="sm" onClick={() => changeStatus('approved')}>
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => changeStatus('removed', 'pending_rejected')}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {vendor.status === 'approved' && (
                      <Button size="sm" onClick={() => changeStatus('live')}>
                        Go live
                      </Button>
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
              <div
                key={d.id}
                className="flex items-start justify-between gap-4 rounded-md border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{DOC_LABELS[d.type] ?? d.type}</span>
                    <DocStatusPill status={d.status} />
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{d.fileName}</div>
                  {d.expiresAt && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Expires {formatDate(d.expiresAt)}
                    </div>
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
                    <Button
                      size="sm"
                      onClick={() => approve(d.id)}
                      disabled={verifyMutation.isPending}
                    >
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

        {/* ── Verification record ─────────────────────────────────────── */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Verification record</CardTitle>
            {canReviewSignals && (
              <Button size="sm" onClick={() => openVerificationDialog(verification)}>
                {verificationLoading ? '…' : verification ? 'Edit' : 'Set up verification'}
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {verificationLoading && (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
            {!verificationLoading && !verification && (
              <p className="text-sm text-muted-foreground">
                No verification record yet. Once created, a panel showing food business
                registration, hygiene rating, insurance, allergen training and identity
                check will appear on the vendor profile.
              </p>
            )}
            {verification && (
              <div className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label="Overall state"
                  value={<VerificationStatePill state={verification.overallState} />}
                />
                <Field label="Registration number" value={verification.registrationNumber} />
                <Field label="Authority" value={verification.registrationAuthority} />
                <Field
                  label="Registration confirmed"
                  value={formatDate(verification.registrationConfirmedAt)}
                />
                <Field label="FHRS status" value={FHRS_LABELS[verification.fhrsInspectionStatus]} />
                <Field
                  label="FHRS rating"
                  value={
                    verification.fhrsRating != null
                      ? `${verification.fhrsRating}/5${verification.fhrsRatingCheckedAt ? ` (checked ${formatDate(verification.fhrsRatingCheckedAt)})` : ''}`
                      : '-'
                  }
                />
                <Field
                  label="Insurance"
                  value={
                    verification.insuranceValidUntil
                      ? `${verification.insuranceProvider ? `${verification.insuranceProvider} - ` : ''}valid until ${formatDate(verification.insuranceValidUntil)}`
                      : '-'
                  }
                />
                <Field
                  label="Allergen training"
                  value={
                    verification.allergenTrainingHeld
                      ? verification.allergenTrainingUntil
                        ? `Valid until ${formatDate(verification.allergenTrainingUntil)}`
                        : 'Held'
                      : 'Not held'
                  }
                />
                <Field
                  label="ID verified"
                  value={verification.idVerifiedAt ? formatDate(verification.idVerifiedAt) : '-'}
                />
                <Field
                  label="Last updated"
                  value={formatDateTime(verification.updatedAt)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Trust signals ────────────────────────────────────────────── */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Trust signals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!signals && <p className="text-sm text-muted-foreground">Loading…</p>}
            {(signals ?? []).map((s) => (
              <div
                key={s.signalType}
                className="flex items-start justify-between gap-4 rounded-md border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {SIGNAL_LABELS[s.signalType] ?? s.signalType}
                    </span>
                    <StatusPill tone={SIGNAL_STATUS_TONE[s.status]}>
                      {s.status.replace('_', ' ')}
                    </StatusPill>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Evidence: {s.evidenceReference ?? '-'}
                  </div>
                  {s.verifiedAt && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      Reviewed {formatDateTime(s.verifiedAt)}
                    </div>
                  )}
                </div>
                {canReviewSignals && (
                  <div className="flex shrink-0 items-center gap-2">
                    {s.status !== 'verified' && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setVerifyingSignal({
                            signalType: s.signalType,
                            label: SIGNAL_LABELS[s.signalType] ?? s.signalType,
                          });
                          setSignalEvidence(s.evidenceReference ?? '');
                        }}
                        disabled={signalMutation.isPending}
                      >
                        Verify
                      </Button>
                    )}
                    {s.status === 'verified' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => expireSignal(s.signalType)}
                        disabled={signalMutation.isPending}
                      >
                        Expire
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={Boolean(verifyingSignal)}
        onOpenChange={(open) => !open && setVerifyingSignal(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verify {verifyingSignal?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Evidence reference (optional)</label>
            <Input
              value={signalEvidence}
              onChange={(e) => setSignalEvidence(e.target.value)}
              placeholder="e.g. FHRS ID, registration number, document link…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerifyingSignal(null)}>
              Cancel
            </Button>
            <Button onClick={confirmVerifySignal} disabled={signalMutation.isPending}>
              Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Reason</label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Document is unreadable…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              onClick={confirmReject}
              disabled={!rejectReason.trim() || verifyMutation.isPending}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verification record form dialog */}
      <Dialog open={verificationOpen} onOpenChange={(open) => !open && setVerificationOpen(false)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {verification ? 'Edit verification record' : 'Set up verification record'}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Once saved, a structured verification panel appears on the public vendor profile above
            the menu.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Registration number *</label>
              <Input
                value={vForm.registrationNumber}
                onChange={(e) => setVForm((f) => ({ ...f, registrationNumber: e.target.value }))}
                placeholder="e.g. FBR/2024/001234"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Registration authority *</label>
              <Input
                value={vForm.registrationAuthority}
                onChange={(e) =>
                  setVForm((f) => ({ ...f, registrationAuthority: e.target.value }))
                }
                placeholder="e.g. London Borough of Hackney"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Registration confirmed date *</label>
              <Input
                type="date"
                value={vForm.registrationConfirmedAt}
                onChange={(e) =>
                  setVForm((f) => ({ ...f, registrationConfirmedAt: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Overall state *</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={vForm.overallState}
                onChange={(e) =>
                  setVForm((f) => ({ ...f, overallState: e.target.value as VerificationState }))
                }
              >
                <option value="VERIFIED">Verified</option>
                <option value="RENEWAL_DUE">Renewal due</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">FHRS inspection status *</label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                value={vForm.fhrsInspectionStatus}
                onChange={(e) =>
                  setVForm((f) => ({
                    ...f,
                    fhrsInspectionStatus: e.target.value as FhrsStatus,
                  }))
                }
              >
                <option value="AWAITING_FIRST_INSPECTION">Awaiting first inspection</option>
                <option value="RATED">Rated</option>
                <option value="EXEMPT">Exempt</option>
                <option value="NOT_FOUND">Not found</option>
              </select>
            </div>
            {vForm.fhrsInspectionStatus === 'RATED' && (
              <>
                <div className="space-y-1">
                  <label className="text-sm font-medium">FHRS rating (0-5)</label>
                  <Input
                    type="number"
                    min={0}
                    max={5}
                    value={vForm.fhrsRating ?? ''}
                    onChange={(e) =>
                      setVForm((f) => ({
                        ...f,
                        fhrsRating: e.target.value === '' ? null : Number(e.target.value),
                      }))
                    }
                    placeholder="e.g. 5"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">FHRS rating checked date</label>
                  <Input
                    type="date"
                    value={vForm.fhrsRatingCheckedAt ?? ''}
                    onChange={(e) =>
                      setVForm((f) => ({
                        ...f,
                        fhrsRatingCheckedAt: e.target.value || null,
                      }))
                    }
                  />
                </div>
              </>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium">Insurance provider</label>
              <Input
                value={vForm.insuranceProvider ?? ''}
                onChange={(e) =>
                  setVForm((f) => ({ ...f, insuranceProvider: e.target.value || null }))
                }
                placeholder="e.g. Hiscox"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Insurance valid until</label>
              <Input
                type="date"
                value={vForm.insuranceValidUntil ?? ''}
                onChange={(e) =>
                  setVForm((f) => ({ ...f, insuranceValidUntil: e.target.value || null }))
                }
              />
            </div>
            <div className="col-span-full flex items-center gap-2">
              <input
                id="allergen-held"
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={vForm.allergenTrainingHeld}
                onChange={(e) =>
                  setVForm((f) => ({ ...f, allergenTrainingHeld: e.target.checked }))
                }
              />
              <label htmlFor="allergen-held" className="text-sm font-medium">
                Allergen training held
              </label>
            </div>
            {vForm.allergenTrainingHeld && (
              <div className="space-y-1">
                <label className="text-sm font-medium">Allergen training valid until</label>
                <Input
                  type="date"
                  value={vForm.allergenTrainingUntil ?? ''}
                  onChange={(e) =>
                    setVForm((f) => ({ ...f, allergenTrainingUntil: e.target.value || null }))
                  }
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium">ID verified date</label>
              <Input
                type="date"
                value={vForm.idVerifiedAt ?? ''}
                onChange={(e) =>
                  setVForm((f) => ({ ...f, idVerifiedAt: e.target.value || null }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerificationOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitVerification}
              disabled={
                upsertVerification.isPending ||
                !vForm.registrationNumber.trim() ||
                !vForm.registrationAuthority.trim() ||
                !vForm.registrationConfirmedAt
              }
            >
              {upsertVerification.isPending ? 'Saving…' : 'Save'}
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

const FHRS_LABELS: Record<FhrsStatus, string> = {
  AWAITING_FIRST_INSPECTION: 'Awaiting first inspection',
  RATED: 'Rated',
  EXEMPT: 'Exempt',
  NOT_FOUND: 'Not found',
};

const VERIFICATION_STATE_TONE: Record<VerificationState, StatusTone> = {
  VERIFIED: 'success',
  RENEWAL_DUE: 'warning',
  SUSPENDED: 'danger',
};

function VerificationStatePill({ state }: { state: VerificationState }) {
  const labels: Record<VerificationState, string> = {
    VERIFIED: 'Verified',
    RENEWAL_DUE: 'Renewal due',
    SUSPENDED: 'Suspended',
  };
  return <StatusPill tone={VERIFICATION_STATE_TONE[state]}>{labels[state]}</StatusPill>;
}
