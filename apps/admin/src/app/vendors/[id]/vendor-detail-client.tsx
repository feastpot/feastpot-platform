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
  useUpdateVendorCompliance,
  useVendorDetail,
  useVendorDocuments,
  useVendorTrustSignals,
  useVerifyDocument,
  type TrustSignalStatus,
  type TrustSignalType,
  type UpdateVendorCompliancePayload,
  type VendorComplianceStatus,
} from '@/hooks/use-vendor-detail';
import {
  useUpsertVerification,
  useVendorVerification,
  type FhrsStatus,
  type UpsertVerificationPayload,
  type VendorVerificationRecord,
  type VerificationState,
} from '@/hooks/use-vendor-verification';
import {
  useVendorTaxProfile,
  useVerifyTaxProfile,
  type VerificationStatus as TaxVerificationStatus,
} from '@/hooks/use-vendor-tax-profile';
import {
  REASON_CODE_LABELS,
  URGENT_REASON_CODES,
  useCreateEnforcementAction,
  useLiftEnforcementAction,
  useVendorEnforcementActions,
  type CreateEnforcementActionPayload,
  type EnforcementAction,
  type EnforcementActionType,
  type ReasonCode,
} from '@/hooks/use-vendor-enforcement';
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
  const updateCompliance = useUpdateVendorCompliance(vendorId);

  const EMPTY_COMPLIANCE_FORM: UpdateVendorCompliancePayload = {
    complianceStatus: 'NOT_ELIGIBLE',
  };
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [cForm, setCForm] = useState<UpdateVendorCompliancePayload>(EMPTY_COMPLIANCE_FORM);

  const [rejecting, setRejecting] = useState<{ id: string; label: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [verifyingSignal, setVerifyingSignal] = useState<{
    signalType: TrustSignalType;
    label: string;
  } | null>(null);
  const [signalEvidence, setSignalEvidence] = useState('');

  // Enforcement
  const { data: enforcementActions = [] } = useVendorEnforcementActions(vendorId);
  const createEnforcement = useCreateEnforcementAction(vendorId);
  const liftEnforcement = useLiftEnforcementAction(vendorId);

  const EMPTY_ENFORCEMENT_FORM: CreateEnforcementActionPayload = {
    actionType: 'RESTRICTION',
    reasonCode: 'MATERIAL_BREACH',
    reasonNarrative: '',
    effectiveAt: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16),
  };
  const [enforcementOpen, setEnforcementOpen] = useState(false);
  const [eForm, setEForm] = useState<CreateEnforcementActionPayload>(EMPTY_ENFORCEMENT_FORM);
  const [liftingAction, setLiftingAction] = useState<EnforcementAction | null>(null);
  const [liftNote, setLiftNote] = useState('');

  function openCreateEnforcement() {
    setEForm(EMPTY_ENFORCEMENT_FORM);
    setEnforcementOpen(true);
  }

  function submitCreateEnforcement() {
    createEnforcement.mutate(eForm, {
      onSuccess: () => {
        setEnforcementOpen(false);
        toast({ title: 'Enforcement action created' });
      },
      onError: (err) =>
        toast({
          title: 'Failed to create action',
          description: (err as Error).message,
          variant: 'destructive',
        }),
    });
  }

  function confirmLift() {
    if (!liftingAction) return;
    liftEnforcement.mutate(
      { actionId: liftingAction.id, liftNote: liftNote.trim() || undefined },
      {
        onSuccess: () => {
          setLiftingAction(null);
          setLiftNote('');
          toast({ title: 'Enforcement action lifted' });
        },
        onError: (err) =>
          toast({
            title: 'Lift failed',
            description: (err as Error).message,
            variant: 'destructive',
          }),
      },
    );
  }

  const activeActions = enforcementActions.filter((a) => !a.liftedAt);
  const historicalActions = enforcementActions.filter((a) => a.liftedAt);

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

        {/* ── FSA compliance status ───────────────────────────────────── */}
        {vendor && (
          <FsaComplianceCard
            vendor={vendor}
            canEdit={canReviewSignals}
            open={complianceOpen}
            form={cForm}
            onOpenDialog={() => {
              setCForm({
                complianceStatus: vendor.complianceStatus,
                fsaHygieneRating: vendor.fsaHygieneRating ?? undefined,
                fsaRatingDate: vendor.fsaRatingDate?.slice(0, 10) ?? undefined,
                fsaRegistrationNumber: vendor.fsaRegistrationNumber ?? undefined,
                fhrsId: vendor.fhrsId ?? undefined,
              });
              setComplianceOpen(true);
            }}
            onCloseDialog={() => setComplianceOpen(false)}
            onChange={(patch) => setCForm((prev) => ({ ...prev, ...patch }))}
            onSave={() =>
              updateCompliance.mutate(cForm, {
                onSuccess: () => {
                  setComplianceOpen(false);
                  toast({ title: 'FSA compliance status updated' });
                },
                onError: (err) =>
                  toast({
                    title: 'Update failed',
                    description: (err as Error).message,
                    variant: 'destructive',
                  }),
              })
            }
            saving={updateCompliance.isPending}
          />
        )}

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
            {verificationLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!verificationLoading && !verification && (
              <p className="text-sm text-muted-foreground">
                No verification record yet. Once created, a panel showing food business
                registration, hygiene rating, insurance, allergen training and identity check will
                appear on the vendor profile.
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
                <Field label="Last updated" value={formatDateTime(verification.updatedAt)} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Tax profile (SI 2023/817) ────────────────────────────────── */}
        <TaxProfilePanel vendorId={vendorId} canReview={canReviewSignals} />

        {/* ── Enforcement actions (P2B clause 14.1) ───────────────────── */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Enforcement actions</CardTitle>
              {activeActions.length > 0 && (
                <p className="mt-0.5 text-xs text-destructive font-medium">
                  {activeActions.length} active
                </p>
              )}
            </div>
            {canReviewSignals && (
              <Button size="sm" variant="outline" onClick={openCreateEnforcement}>
                + New action
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {enforcementActions.length === 0 && (
              <p className="text-sm text-muted-foreground">No enforcement actions recorded.</p>
            )}
            {activeActions.map((a) => (
              <div
                key={a.id}
                className="rounded-md border border-destructive/40 bg-red-50 p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">
                        {a.actionType}
                      </span>
                      <span className="font-medium text-dark">
                        {REASON_CODE_LABELS[a.reasonCode as ReasonCode] ?? a.reasonCode}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {a.reasonNarrative}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Effective: {formatDateTime(a.effectiveAt)} &middot; Issued by: {a.issuedBy}
                    </p>
                  </div>
                  {canReviewSignals && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setLiftingAction(a);
                        setLiftNote('');
                      }}
                    >
                      Lift
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {historicalActions.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-dark">
                  {historicalActions.length} historical{' '}
                  {historicalActions.length === 1 ? 'action' : 'actions'}
                </summary>
                <div className="mt-2 space-y-2">
                  {historicalActions.map((a) => (
                    <div key={a.id} className="rounded-md border border-border bg-surface p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-bold">
                          {a.actionType}
                        </span>
                        <span>
                          {REASON_CODE_LABELS[a.reasonCode as ReasonCode] ?? a.reasonCode}
                        </span>
                        <span>&middot; effective {formatDate(a.effectiveAt)}</span>
                        <span>&middot; lifted {a.liftedAt ? formatDate(a.liftedAt) : '-'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
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
                onChange={(e) => setVForm((f) => ({ ...f, registrationAuthority: e.target.value }))}
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
                onChange={(e) => setVForm((f) => ({ ...f, idVerifiedAt: e.target.value || null }))}
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

      {/* ── Create enforcement action dialog ─────────────────────────── */}
      <Dialog open={enforcementOpen} onOpenChange={(open) => !open && setEnforcementOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create enforcement action</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            P2B vendor terms clause 14.1. A notice email is sent automatically. All four P2B
            business rules are enforced server-side.
          </p>
          <div className="mt-2 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Action type</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={eForm.actionType}
                  onChange={(e) =>
                    setEForm((f) => ({ ...f, actionType: e.target.value as EnforcementActionType }))
                  }
                >
                  <option value="RESTRICTION">Restriction</option>
                  <option value="SUSPENSION">Suspension</option>
                  <option value="TERMINATION">Termination</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Reason code</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={eForm.reasonCode}
                  onChange={(e) =>
                    setEForm((f) => ({ ...f, reasonCode: e.target.value as ReasonCode }))
                  }
                >
                  {(Object.entries(REASON_CODE_LABELS) as [ReasonCode, string][]).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">
                Statement of reasons{' '}
                <span className="font-normal text-muted-foreground">(min 50 chars)</span>
              </label>
              <textarea
                className="flex min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground"
                value={eForm.reasonNarrative}
                onChange={(e) => setEForm((f) => ({ ...f, reasonNarrative: e.target.value }))}
                placeholder="Describe the specific facts, dates, and evidence that justify this action…"
              />
              <p className="text-[11px] text-muted-foreground">
                {eForm.reasonNarrative.length}/50 min chars
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Effective date &amp; time</label>
              <Input
                type="datetime-local"
                value={eForm.effectiveAt}
                onChange={(e) => setEForm((f) => ({ ...f, effectiveAt: e.target.value }))}
              />
            </div>

            {URGENT_REASON_CODES.includes(eForm.reasonCode as ReasonCode) && (
              <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3">
                <label className="text-sm font-medium text-amber-800">
                  Urgent basis{' '}
                  <span className="font-normal">(required for urgent reason codes)</span>
                </label>
                <Input
                  value={eForm.urgentBasis ?? ''}
                  onChange={(e) =>
                    setEForm((f) => ({ ...f, urgentBasis: e.target.value || undefined }))
                  }
                  placeholder="e.g. Immediate food safety risk - FHRS score 0 confirmed…"
                  className="border-amber-300"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnforcementOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitCreateEnforcement}
              disabled={createEnforcement.isPending || eForm.reasonNarrative.trim().length < 50}
            >
              {createEnforcement.isPending ? 'Creating…' : 'Create action'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Lift enforcement action dialog ───────────────────────────── */}
      <Dialog
        open={Boolean(liftingAction)}
        onOpenChange={(open) => !open && setLiftingAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lift enforcement action</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Lifting this action will restore the vendor&#39;s prior status and send a confirmation
            email.
          </p>
          <div className="space-y-1 py-2">
            <label className="text-sm font-medium">
              Note to vendor <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              value={liftNote}
              onChange={(e) => setLiftNote(e.target.value)}
              placeholder="e.g. Renewed certification received and verified…"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiftingAction(null)}>
              Cancel
            </Button>
            <Button onClick={confirmLift} disabled={liftEnforcement.isPending}>
              {liftEnforcement.isPending ? 'Lifting…' : 'Confirm lift'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Tax profile panel (SI 2023/817) ─────────────────────────────────────────

const TAX_STATUS_TONE: Record<TaxVerificationStatus, StatusTone> = {
  PENDING: 'warning',
  VERIFIED: 'success',
  FAILED: 'danger',
  EXEMPT: 'neutral',
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  SOLE_TRADER: 'Sole trader / individual',
  LIMITED_COMPANY: 'Limited company',
  PARTNERSHIP: 'Partnership',
};

const COMPLIANCE_STATUS_LABELS: Record<VendorComplianceStatus, string> = {
  RATED: 'Rated',
  REGISTERED_AWAITING_INSPECTION: 'Registered, awaiting inspection',
  NOT_ELIGIBLE: 'Not eligible',
};

const COMPLIANCE_STATUS_TONE: Record<VendorComplianceStatus, StatusTone> = {
  RATED: 'success',
  REGISTERED_AWAITING_INSPECTION: 'warning',
  NOT_ELIGIBLE: 'danger',
};

function FsaComplianceCard({
  vendor,
  canEdit,
  open,
  form,
  onOpenDialog,
  onCloseDialog,
  onChange,
  onSave,
  saving,
}: {
  vendor: import('@/hooks/use-vendor-detail').VendorDetail;
  canEdit: boolean;
  open: boolean;
  form: UpdateVendorCompliancePayload;
  onOpenDialog: () => void;
  onCloseDialog: () => void;
  onChange: (patch: Partial<UpdateVendorCompliancePayload>) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const status = vendor.complianceStatus;
  return (
    <>
      <Card className="lg:col-span-3">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">FSA compliance</CardTitle>
          {canEdit && (
            <Button size="sm" onClick={onOpenDialog}>
              Update
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Field
            label="Status"
            value={
              <StatusPill tone={COMPLIANCE_STATUS_TONE[status]}>
                {COMPLIANCE_STATUS_LABELS[status]}
              </StatusPill>
            }
          />
          <Field
            label="FSA hygiene rating"
            value={
              vendor.fsaHygieneRating !== null ? `${vendor.fsaHygieneRating} / 5` : 'Not recorded'
            }
          />
          <Field
            label="Rating date"
            value={vendor.fsaRatingDate ? formatDate(vendor.fsaRatingDate) : 'Not recorded'}
          />
          <Field
            label="Registration number"
            value={vendor.fsaRegistrationNumber ?? 'Not recorded'}
          />
          <Field label="FHRS ID" value={vendor.fhrsId ?? 'Not recorded'} />
          <Field
            label="Last checked"
            value={vendor.fsaLastChecked ? formatDate(vendor.fsaLastChecked) : 'Never'}
          />
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={open} onOpenChange={(o) => !o && onCloseDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update FSA compliance</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="space-y-1">
              <label className="font-medium">Compliance status</label>
              <select
                className="w-full rounded border px-3 py-2"
                value={form.complianceStatus}
                onChange={(e) =>
                  onChange({ complianceStatus: e.target.value as VendorComplianceStatus })
                }
              >
                <option value="RATED">Rated</option>
                <option value="REGISTERED_AWAITING_INSPECTION">
                  Registered, awaiting inspection
                </option>
                <option value="NOT_ELIGIBLE">Not eligible</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="font-medium">FSA hygiene rating (0–5)</label>
              <Input
                type="number"
                min={0}
                max={5}
                value={form.fsaHygieneRating ?? ''}
                onChange={(e) =>
                  onChange({
                    fsaHygieneRating: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder="e.g. 4"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">Rating date</label>
              <Input
                type="date"
                value={form.fsaRatingDate ?? ''}
                onChange={(e) => onChange({ fsaRatingDate: e.target.value || undefined })}
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">Registration number</label>
              <Input
                value={form.fsaRegistrationNumber ?? ''}
                onChange={(e) => onChange({ fsaRegistrationNumber: e.target.value || undefined })}
                placeholder="Local authority registration number"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium">FHRS ID</label>
              <Input
                value={form.fhrsId ?? ''}
                onChange={(e) => onChange({ fhrsId: e.target.value || undefined })}
                placeholder="FHRS establishment ID"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onCloseDialog}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TaxProfilePanel({ vendorId, canReview }: { vendorId: string; canReview: boolean }) {
  const { data: profile, isLoading } = useVendorTaxProfile(vendorId);
  const verify = useVerifyTaxProfile(vendorId);
  const [form, setForm] = useState<{
    status: TaxVerificationStatus;
    verificationMethod: string;
    note: string;
  }>({ status: 'VERIFIED', verificationMethod: '', note: '' });
  const [formOpen, setFormOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  return (
    <Card className="lg:col-span-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Tax profile</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Required under SI 2023/817 (Platform Operators Regulations 2023)
          </p>
        </div>
        {canReview && profile && !formOpen && (
          <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>
            Verify / update status
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && !profile && (
          <p className="text-sm text-muted-foreground">
            No tax profile on file. The vendor must complete this before going live.
          </p>
        )}
        {profile && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Field
                label="Verification status"
                value={
                  <StatusPill tone={TAX_STATUS_TONE[profile.verificationStatus]}>
                    {profile.verificationStatus}
                  </StatusPill>
                }
              />
              <Field
                label="Entity type"
                value={ENTITY_TYPE_LABELS[profile.entityType] ?? profile.entityType}
              />
              <Field label="Legal name" value={profile.legalName} />
              {profile.tradingName && <Field label="Trading name" value={profile.tradingName} />}
              <Field
                label="Address"
                value={[
                  profile.addressLine1,
                  profile.addressLine2,
                  profile.city,
                  profile.postcode,
                  profile.country,
                ]
                  .filter(Boolean)
                  .join(', ')}
              />
              {profile.dateOfBirth && (
                <Field
                  label="Date of birth"
                  value={new Date(profile.dateOfBirth).toLocaleDateString('en-GB')}
                />
              )}
              {profile.companyNumber && (
                <Field label="Company number" value={profile.companyNumber} />
              )}
              <Field label="Tax identifier (UTR/NI)" value={profile.taxIdentifier ?? '-'} />
              {profile.vatNumber && <Field label="VAT number" value={profile.vatNumber} />}
              {profile.verificationMethod && (
                <Field label="Verification method" value={profile.verificationMethod} />
              )}
              {profile.verifiedAt && (
                <Field
                  label="Verified at"
                  value={new Date(profile.verifiedAt).toLocaleDateString('en-GB')}
                />
              )}
              <Field
                label="Last updated"
                value={new Date(profile.updatedAt).toLocaleDateString('en-GB')}
              />
            </div>

            {canReview && formOpen && (
              <div className="rounded-md border border-border bg-surface p-4">
                <p className="mb-3 text-sm font-semibold text-dark">Update verification status</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Status
                    </label>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={form.status}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          status: e.target.value as TaxVerificationStatus,
                        }))
                      }
                    >
                      <option value="VERIFIED">Verified</option>
                      <option value="FAILED">Failed: update required</option>
                      <option value="EXEMPT">Exempt</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Verification method
                    </label>
                    <Input
                      value={form.verificationMethod}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, verificationMethod: e.target.value }))
                      }
                      placeholder="e.g. HMRC match, manual review"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Note to vendor (shown if status is Failed)
                  </label>
                  <textarea
                    className="flex min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                    value={form.note}
                    onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                    placeholder="Describe what needs correcting"
                  />
                </div>
                {submitError && <p className="mt-2 text-xs text-destructive">{submitError}</p>}
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFormOpen(false);
                      setSubmitError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={verify.isPending || !form.verificationMethod}
                    onClick={() => {
                      setSubmitError(null);
                      verify.mutate(
                        {
                          status: form.status,
                          verificationMethod: form.verificationMethod,
                          note: form.note || undefined,
                        },
                        {
                          onSuccess: () => setFormOpen(false),
                          onError: (err) =>
                            setSubmitError(err instanceof Error ? err.message : 'Save failed'),
                        },
                      );
                    }}
                  >
                    {verify.isPending ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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
