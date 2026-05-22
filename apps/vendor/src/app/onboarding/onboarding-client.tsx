'use client';

import { Badge, Button, Card, CardContent } from '@feastpot/ui';
import { Check, ExternalLink, Upload } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { DocumentRow, REQUIRED_DOCS } from '@/components/compliance/compliance-docs';
import { useToast } from '@/components/ui/toaster';
import { useCreateStripeConnectLink } from '@/hooks/use-stripe-connect';
import { useUploadDocument, useVendorDocuments } from '@/hooks/use-vendor-documents';

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
 * 4-step wizard indicator. We render all four step cards on the page (the
 * vendor can work on them in parallel - Stripe in one tab, doc upload in
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

  // Newest-first: keep the first occurrence per type so re-uploads surface
  // immediately. `new Map(arr)` would keep the LAST (oldest) value on key
  // collision — see compliance-client.tsx for full rationale.
  const docByType = new Map<string, (typeof docs.data extends (infer U)[] | undefined ? U : never)>();
  for (const d of docs.data ?? []) if (!docByType.has(d.type)) docByType.set(d.type, d);
  const allDocsUploaded = REQUIRED_DOCS.every((d) => docByType.has(d.type));
  const stripeReady = !!vendor.stripeAccountId && vendor.payoutsEnabled;
  const profileDone = !!vendor.description && vendor.cuisines.length > 0;
  // canGoLive previously ignored profile completion - meaning the "All set!"
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
              You&apos;re back from Stripe - give it a moment to update, then refresh this page.
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
                ? 'Looks good - your description and cuisines are set.'
                : 'Add a short description and at least one cuisine type from your profile.'}
            </p>
            <Link href="/settings/delivery" className="mt-2 inline-block">
              <Button variant="outline" size="sm">Open delivery settings</Button>
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">
              Profile editing UI is on the roadmap - for now this lives in the admin app.
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
                  type={d.type}
                  label={d.label}
                  why={d.why}
                  mustShow={d.mustShow}
                  acceptedFiles={d.acceptedFiles}
                  doc={doc ?? null}
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
 * - The whole strip is decorative for AT users - the underlying step
 *   cards already announce their done/active state via the existing
 *   `<Step>` heading and badge - so we mark it `aria-hidden`.
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
                  // WCAG AA - the spec's #9B9894 was 3.2:1 and would have
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

