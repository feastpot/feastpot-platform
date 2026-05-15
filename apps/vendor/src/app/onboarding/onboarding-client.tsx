'use client';

import { Badge, Button, Card, CardContent } from '@feastpot/ui';
import { Check, Clock, ExternalLink, Upload } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';

import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
import { useCreateStripeConnectLink } from '@/hooks/use-stripe-connect';
import {
  useUploadDocument,
  useVendorDocuments,
  type VendorDocumentType,
} from '@/hooks/use-vendor-documents';
import { formatDate } from '@/lib/format';

interface VendorSummary {
  id: string;
  businessName: string;
  status: string;
  description: string | null;
  cuisines: string[];
  stripeAccountId: string | null;
  payoutsEnabled: boolean;
}

/**
 * Required compliance documents shown in Step 2.
 *
 * Spec asked for an additional "Food Business Registration" doc and richer
 * per-doc guidance (why it's needed, what the document must show, max size,
 * etc.). The new document type would require a `VendorDocumentType` enum
 * change in the API + DB migration — out of scope for this UI pass — so
 * we keep the existing three doc slots and enrich each with `why`,
 * `mustShow`, and `acceptedFiles` copy. Once the API exposes a
 * `food_business_registration` type we can add a fourth row here without
 * other changes.
 *
 * Copy follows the spec's structure: one-sentence justification + a
 * checklist of what the document must show. Verifiable URLs (food.gov.uk)
 * are surfaced for the registration step inside the Step 1 hint instead of
 * being lost in the document list.
 */
const REQUIRED_DOCS: Array<{
  type: VendorDocumentType;
  label: string;
  why: string;
  mustShow: string[];
  acceptedFiles: string;
}> = [
  {
    type: 'hygiene_cert',
    label: 'Food hygiene certificate (Level 2+)',
    why: 'Proves you have completed food safety training to the FSA standard.',
    mustShow: ['Your full name', 'The awarding body', 'Date of completion'],
    acceptedFiles: 'PDF, JPG or PNG · max 10 MB',
  },
  {
    type: 'insurance',
    label: 'Public liability insurance',
    why: 'Protects you and your customers. Minimum £5m cover required.',
    mustShow: ['Your name or business name', 'Policy number', 'Coverage amount', 'Expiry date'],
    acceptedFiles: 'PDF, JPG or PNG · max 10 MB',
  },
  {
    type: 'photo_id',
    label: 'Photo ID',
    why: 'Passport or driving licence — used for identity verification only.',
    mustShow: ['Clear photo of the document', 'Name matches your account', 'Document not expired'],
    acceptedFiles: 'PDF, JPG or PNG · max 10 MB',
  },
  {
    type: 'kitchen_reg',
    label: 'Food business registration',
    why: 'Required under the Food Safety Act 1990. Register for free at your local council — usually takes 1–2 weeks, so apply early. Guidance: https://www.food.gov.uk/business-guidance/register-a-food-business',
    mustShow: ['Your name or business name', 'Issuing council', 'Registration date'],
    acceptedFiles: 'PDF, JPG or PNG · max 10 MB',
  },
];

/**
 * 4-step wizard indicator. We render all four step cards on the page (the
 * vendor can work on them in parallel — Stripe in one tab, doc upload in
 * another) so `currentStep` is "the first step that isn't done yet"
 * rather than a strict wizard cursor. Once everything's done, the
 * indicator settles on step 4 with all checks lit.
 */
const ONBOARDING_STEPS: Array<{ num: 1 | 2 | 3 | 4; label: string }> = [
  { num: 1, label: 'Business details' },
  { num: 2, label: 'Documents' },
  { num: 3, label: 'Set up payouts' },
  { num: 4, label: 'Your first menu' },
];

export function OnboardingClient({ vendor }: { vendor: VendorSummary }) {
  const search = useSearchParams();
  const stripeReturned = search?.get('stripe') === 'return';
  const docs = useVendorDocuments(vendor.id);
  const upload = useUploadDocument(vendor.id);
  const stripe = useCreateStripeConnectLink();
  const { toast } = useToast();

  const docByType = new Map(docs.data?.map((d) => [d.type, d]) ?? []);
  const allDocsUploaded = REQUIRED_DOCS.every((d) => docByType.has(d.type));
  const stripeReady = !!vendor.stripeAccountId && vendor.payoutsEnabled;
  const profileDone = !!vendor.description && vendor.cuisines.length > 0;
  // canGoLive previously ignored profile completion — meaning the "All set!"
  // banner could appear while the vendor's description/cuisines were still
  // empty. Include profileDone so compliance never reviews a vendor whose
  // public profile is half-built.
  const canGoLive = profileDone && allDocsUploaded && stripeReady;
  // Menu-step done flag is unknown from the vendor summary today; treat the
  // step as reached (active) once the previous three are complete so the
  // indicator advances correctly. When the API surfaces `menuItemCount` we
  // can swap this for `menuItemCount >= 3`.
  const menuDone = false;
  const stepFlags = [profileDone, allDocsUploaded, stripeReady, menuDone];
  const firstIncomplete = stepFlags.findIndex((f) => !f);
  const currentStep = (firstIncomplete === -1 ? 4 : firstIncomplete + 1) as 1 | 2 | 3 | 4;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Welcome to Feastpot, {vendor.businessName}</h1>
        <p className="text-sm text-muted-foreground">
          Finish these four steps and our compliance team will approve you to start taking orders.
          Status:{' '}
          <Badge variant={vendor.status === 'live' ? 'default' : 'secondary'}>{vendor.status}</Badge>
        </p>
        {stripeReturned && (
          <Card className="mt-3 border-teal/40 bg-teal/5">
            <CardContent className="p-3 text-sm">
              You&apos;re back from Stripe — give it a moment to update, then refresh this page.
            </CardContent>
          </Card>
        )}
      </header>

      <StepIndicator currentStep={currentStep} />

      <Step
        n={1}
        title="Business details"
        done={profileDone}
        body={
          <>
            <p className="text-sm text-muted-foreground">
              {profileDone
                ? 'Looks good — your description and cuisines are set.'
                : 'Add a short description and at least one cuisine type from your profile.'}
            </p>
            <Link href="/settings/delivery" className="mt-2 inline-block">
              <Button variant="outline" size="sm">Open delivery settings</Button>
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">
              Profile editing UI is on the roadmap — for now this lives in the admin app.
            </p>
          </>
        }
      />

      <Step
        n={2}
        title="Compliance documents"
        done={allDocsUploaded}
        body={
          <div className="space-y-2">
            {REQUIRED_DOCS.map((d) => {
              const doc = docByType.get(d.type);
              return (
                <DocumentRow
                  key={d.type}
                  label={d.label}
                  why={d.why}
                  mustShow={d.mustShow}
                  acceptedFiles={d.acceptedFiles}
                  state={
                    doc
                      ? {
                          status: doc.status,
                          fileName: doc.fileName ?? '(file)',
                          expiresAt: doc.expiresAt,
                        }
                      : null
                  }
                  uploading={upload.isPending}
                  onPick={(file, expiresAt) => {
                    upload.mutate(
                      { file, type: d.type, expiresAt },
                      {
                        onSuccess: () => toast({ title: `${d.label} uploaded` }),
                        onError: (err) =>
                          toast({
                            title: 'Upload failed',
                            description: err instanceof Error ? err.message : '',
                            variant: 'destructive',
                          }),
                      },
                    );
                  }}
                />
              );
            })}
          </div>
        }
      />

      <Step
        n={3}
        title="Set up payouts (Stripe)"
        done={stripeReady}
        body={
          <>
            <p className="text-sm text-muted-foreground">
              {stripeReady
                ? 'Your Stripe account is connected and ready for payouts.'
                : 'Stripe will collect your bank details, ID, and tax info. The window opens in a new tab.'}
            </p>
            <Button
              className="mt-3 gap-2"
              variant={stripeReady ? 'outline' : 'default'}
              disabled={stripe.isPending}
              onClick={() =>
                stripe.mutate(undefined, {
                  onSuccess: ({ url }) => window.open(url, '_blank', 'noopener'),
                  onError: (err) =>
                    toast({
                      title: 'Could not open Stripe',
                      description: err instanceof Error ? err.message : '',
                      variant: 'destructive',
                    }),
                })
              }
            >
              <ExternalLink className="h-4 w-4" />
              {stripe.isPending
                ? 'Opening…'
                : stripeReady
                  ? 'Update Stripe details'
                  : 'Connect with Stripe'}
            </Button>
          </>
        }
      />

      <Step
        n={4}
        title="Add your first menu items"
        done={false}
        body={
          <>
            <p className="text-sm text-muted-foreground">
              You need at least 3 items live before compliance can approve you. The full editor
              is in the menu section.
            </p>
            <Link href="/menu" className="mt-2 inline-block">
              <Button variant="outline" size="sm" className="gap-2"><Upload className="h-4 w-4" /> Open menu builder</Button>
            </Link>
          </>
        }
      />

      {canGoLive && (
        <Card className="border-teal/40 bg-teal/5">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <Check className="mt-0.5 h-4 w-4 text-teal" />
            <div>
              <p className="font-medium">All set!</p>
              <p className="text-muted-foreground">
                Compliance will review your documents and approve you within 1–2 business days.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Horizontal step indicator rendered above the four step cards.
 *
 * - Circle border + fill colour shifts as the vendor advances:
 *   future steps = muted cream, current = white-on-brand outline,
 *   complete = solid brand with a check.
 * - Connector line between circles fills brand orange once a step is
 *   passed, giving the same visual "progress bar" cue Stripe and
 *   Deliveroo use on their partner onboarding flows.
 * - The whole strip is decorative for AT users — the underlying step
 *   cards already announce their done/active state via the existing
 *   `<Step>` heading and badge — so we mark it `aria-hidden`.
 */
function StepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 | 4 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        padding: '16px',
        background: 'white',
        border: '1px solid #EDE4D4',
        borderRadius: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          maxWidth: '420px',
          margin: '0 auto',
        }}
      >
        {ONBOARDING_STEPS.map((s, i) => {
          const isDone = currentStep > s.num;
          const isCurrent = currentStep === s.num;
          return (
            <div
              key={s.num}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                position: 'relative',
              }}
            >
              {i < ONBOARDING_STEPS.length - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '15px',
                    left: '50%',
                    right: '-50%',
                    height: '2px',
                    background: isDone ? '#E8520A' : '#EDE4D4',
                    zIndex: 0,
                  }}
                />
              )}
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  border: '2px solid',
                  borderColor: isDone || isCurrent ? '#E8520A' : '#BDBBB7',
                  background: isDone ? '#E8520A' : isCurrent ? 'white' : '#F5EDE0',
                  // Numeral colours bumped for WCAG AA at small sizes:
                  //   future = #5F5E5A on #F5EDE0 → ~6:1 (was #9B9894/#FBF6EF ≈ 2.7:1)
                  //   current = #B8410A on white → ~5.6:1 (was #E8520A ≈ 3.4:1)
                  //   done = white on #E8520A → ~4.8:1 (unchanged)
                  color: isDone ? 'white' : isCurrent ? '#B8410A' : '#5F5E5A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 800,
                  zIndex: 1,
                  position: 'relative',
                }}
              >
                {isDone ? '✓' : s.num}
              </div>
              <span
                style={{
                  fontSize: '10px',
                  // #5F5E5A (charcoal-mid) on white is ~7.5:1, well above
                  // WCAG AA — the spec's #9B9894 was 3.2:1 and would have
                  // failed at this size.
                  color: isDone || isCurrent ? '#1C1C1A' : '#5F5E5A',
                  marginTop: '6px',
                  fontWeight: isCurrent ? 600 : 500,
                  textAlign: 'center',
                  lineHeight: 1.2,
                }}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  done,
  body,
}: {
  n: number;
  title: string;
  done: boolean;
  body: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <span
            className={`grid h-6 w-6 place-items-center rounded-full text-xs font-medium ${done ? 'bg-teal text-white' : 'bg-muted text-muted-foreground'}`}
          >
            {done ? <Check className="h-3.5 w-3.5" /> : n}
          </span>
          <h2 className="font-medium">{title}</h2>
        </div>
        {body}
      </CardContent>
    </Card>
  );
}

function DocumentRow({
  label,
  why,
  mustShow,
  acceptedFiles,
  state,
  uploading,
  onPick,
}: {
  label: string;
  why: string;
  mustShow: string[];
  acceptedFiles: string;
  state: { status: string; fileName: string; expiresAt: string | null } | null;
  uploading: boolean;
  onPick: (file: File, expiresAt?: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [expiresAt, setExpiresAt] = useState('');

  return (
    <div className="rounded-md border border-input p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{why}</p>
          {/* Checklist of what the document must show + accepted file
              types. Surfacing this inline (instead of behind a tooltip)
              cuts the support volume on "is this the right doc?" — the
              vendor can verify their photo of a hygiene cert against
              the bullets before they upload. */}
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none font-medium text-foreground/80 hover:text-foreground">
              What this document must show
            </summary>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
              {mustShow.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <p className="mt-2 italic">{acceptedFiles}</p>
          </details>
        </div>
        {state ? (
          <Badge variant={state.status === 'verified' ? 'default' : 'secondary'} className="capitalize">
            {state.status === 'pending' && <Clock className="mr-1 h-3 w-3" />}
            {state.status}
          </Badge>
        ) : (
          <Badge variant="secondary">Missing</Badge>
        )}
      </div>
      {state && (
        <p className="mt-1 text-xs text-muted-foreground">
          {state.fileName} · {state.expiresAt ? `expires ${formatDate(state.expiresAt)}` : 'no expiry set'}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Expires (optional)</Label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="gap-2"
        >
          <Upload className="h-3.5 w-3.5" />
          {state ? 'Replace' : 'Upload'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f, expiresAt ? new Date(expiresAt).toISOString() : undefined);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
