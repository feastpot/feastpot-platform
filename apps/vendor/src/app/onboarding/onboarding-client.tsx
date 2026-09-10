'use client';

import { Badge, Button, Card, CardContent } from '@feastpot/ui';
import { brandColors } from '@feastpot/ui/brand';
import { Check, Upload } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { DocumentRow, REQUIRED_DOCS } from '@/components/compliance/compliance-docs';
import { useToast } from '@/components/ui/toaster';
import { StripeAccountOnboarding } from '@/components/onboarding/stripe-account-onboarding';
import { useOnboardingProgress } from '@/hooks/use-onboarding-progress';
import { useTermsAcceptanceStatus } from '@/hooks/use-terms-acceptance';
import { useUploadDocument, useVendorDocuments } from '@/hooks/use-vendor-documents';
import {
  RequiredOnboardingItemName,
  useRequiredOnboardingItems,
  useUpdateRequiredOnboardingItem,
} from '@/hooks/use-required-onboarding-items';
import { useTrackEvent } from '@/hooks/use-track-event';

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
 * 5-step wizard indicator. Step 3 is Terms acceptance (added between
 * Documents and Payouts so vendors click-wrap before they can go live).
 * We render all five step cards on the page (vendor can work on several
 * in parallel) so `currentStep` is "the first step that isn't done yet".
 */
const ONBOARDING_STEPS: Array<{ num: 1 | 2 | 3 | 4 | 5; label: string }> = [
  { num: 1, label: 'Business details' },
  { num: 2, label: 'Documents' },
  { num: 3, label: 'Terms' },
  { num: 4, label: 'Set up payouts' },
  { num: 5, label: 'Your first menu' },
];

export function OnboardingClient({ vendor }: { vendor: VendorSummary }) {
  const search = useSearchParams();
  const stripeReturned = search?.get('stripe') === 'return';
  const termsJustAccepted = search?.get('terms') === 'accepted';
  const docs = useVendorDocuments(vendor.id);
  const progress = useOnboardingProgress();
  const termsStatus = useTermsAcceptanceStatus();
  const upload = useUploadDocument(vendor.id);
  const requiredItems = useRequiredOnboardingItems();
  const updateRequiredItem = useUpdateRequiredOnboardingItem();
  const track = useTrackEvent();
  const itemParam = search?.get('item') as RequiredOnboardingItemName | null;
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const router = useRouter();
  const refreshProgress = useCallback(() => router.refresh(), [router]);
  const { toast } = useToast();

  useEffect(() => {
    if (!itemParam || !requiredItems.isSuccess) return;
    const item = itemRefs.current[itemParam];
    if (!item) return;
    item.scrollIntoView({ behavior: 'smooth', block: 'center' });
    item.focus({ preventScroll: true });
  }, [itemParam, requiredItems.isSuccess]);

  const requiredItemStates = useMemo(
    () => new Map((requiredItems.data ?? []).map((item) => [item.name, item.state])),
    [requiredItems.data],
  );

  // Newest-first: keep the first occurrence per type so re-uploads surface
  // immediately. `new Map(arr)` would keep the LAST (oldest) value on key
  // collision - see compliance-client.tsx for full rationale.
  const docByType = new Map<string, typeof docs.data extends (infer U)[] | undefined ? U : never>();
  for (const d of docs.data ?? []) if (!docByType.has(d.type)) docByType.set(d.type, d);
  const allDocsUploaded = REQUIRED_DOCS.every((d) => docByType.has(d.type));
  const stripeReady = !!vendor.stripeAccountId && vendor.payoutsEnabled;
  const profileDone = !!vendor.description && vendor.cuisines.length > 0;
  // Terms acceptance: treat as done if status returns accepted, or while
  // loading (optimistic -- the gate re-checks server-side at activation).
  const termsDone = termsStatus.data?.accepted ?? termsJustAccepted;
  const menuDone =
    progress.data?.steps.find((step) => step.name === 'allergen_declared_menu_item')?.complete ??
    false;
  // Publication eligibility comes from the server's fresh hard-gate evidence,
  // never from this screen's local approximation.
  const canGoLive = progress.data?.canProfileGoLive ?? false;
  const stepFlags = [profileDone, allDocsUploaded, termsDone, stripeReady, menuDone];
  const firstIncomplete = stepFlags.findIndex((f) => !f);
  const currentStep = (firstIncomplete === -1 ? 5 : firstIncomplete + 1) as 1 | 2 | 3 | 4 | 5;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Welcome to Feastpot, {vendor.businessName}</h1>
        <p className="text-sm text-muted-foreground">
          Complete the go-live requirements below. Optional profile improvements never block
          publication. Status:{' '}
          <Badge variant={vendor.status === 'live' ? 'default' : 'secondary'}>
            {vendor.status}
          </Badge>
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

      {itemParam && (
        <Card className="border-teal/40 bg-teal/5" role="status">
          <CardContent className="p-3 text-sm">
            Welcome back. We opened the requested onboarding item for you, so you can resume it
            whenever you are ready.
          </CardContent>
        </Card>
      )}

      <Step
        n={0}
        title="Required items"
        done={
          requiredItems.isSuccess &&
          REQUIRED_ONBOARDING_ITEMS.every(
            (item) => requiredItemStates.get(item.name) === 'supplied',
          )
        }
        body={
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              These are practical next steps after approval. You can defer an item and return to it
              later, but any deferred required item still blocks going live where shown.
            </p>
            {requiredItems.isLoading && (
              <p className="text-sm text-muted-foreground">Loading your required items…</p>
            )}
            {requiredItems.isError && (
              <p className="text-sm text-destructive">
                We could not load your required items. Please refresh and try again.
              </p>
            )}
            {REQUIRED_ONBOARDING_ITEMS.map((item) => {
              const state = requiredItemStates.get(item.name) ?? 'outstanding';
              const isFocused = itemParam === item.name;
              return (
                <div
                  key={item.name}
                  ref={(element) => {
                    itemRefs.current[item.name] = element;
                  }}
                  tabIndex={-1}
                  className={`rounded-lg border p-3 ${isFocused ? 'border-teal ring-2 ring-teal/30' : ''}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{item.label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.help}</p>
                    </div>
                    <Badge variant={state === 'supplied' ? 'default' : 'secondary'}>
                      {state === 'supplied'
                        ? 'Provided'
                        : state === 'deferred'
                          ? 'I’ll add this later'
                          : 'To do'}
                    </Badge>
                  </div>
                  {state !== 'supplied' ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Link href={item.evidenceHref}>
                        <Button size="sm" variant="outline">
                          {state === 'deferred' ? 'Resume / add now' : 'Add now'}
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant={state === 'deferred' ? 'default' : 'outline'}
                        disabled={updateRequiredItem.isPending}
                        onClick={() => {
                          updateRequiredItem.mutate(
                            { name: item.name, state: 'deferred' },
                            {
                              onSuccess: () =>
                                track(
                                  'vendor_required_item_deferred',
                                  { item: item.name },
                                  vendor.id,
                                ),
                              onError: () =>
                                toast({
                                  title: 'Could not save this yet',
                                  description: 'Please try again.',
                                  variant: 'destructive',
                                }),
                            },
                          );
                        }}
                      >
                        I&apos;ll add this later
                      </Button>
                      {state === 'deferred' && (
                        <span className="text-xs text-amber-700">Still blocks going live</span>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Supplied and recorded by Feastpot. This status is read-only here.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        }
      />

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
              <Button variant="outline" size="sm">
                Open delivery settings
              </Button>
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

      {/* Step 3: Terms acceptance -- must happen before payouts go live */}
      <Step
        n={3}
        title="Vendor Terms of Agreement"
        done={termsDone}
        body={
          <>
            <p className="text-sm text-muted-foreground">
              {termsDone
                ? 'You have read and accepted the Feastpot Vendor Terms of Agreement.'
                : 'Read and accept the current Vendor Terms of Agreement before menu setup or go-live. Takes about 5 minutes.'}
            </p>
            {!termsDone && (
              <Link href="/onboarding/terms" className="mt-2 inline-block">
                <Button variant="default" size="sm">
                  Review and accept terms
                </Button>
              </Link>
            )}
            {!termsDone && (
              <p className="mt-2 text-xs text-muted-foreground">
                You must scroll through the full terms and tick the checkbox -- pre-ticked boxes are
                not valid consent.
              </p>
            )}
          </>
        }
      />

      <Step
        n={4}
        title="Set up payouts (Stripe)"
        done={stripeReady}
        body={
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {stripeReady
                ? 'Your Stripe account is connected and ready for payouts.'
                : 'Complete this securely inside Feastpot. You can save your progress and come back later.'}
            </p>
            <StripeAccountOnboarding
              existingAccountId={vendor.stripeAccountId}
              payoutsEnabled={vendor.payoutsEnabled}
              onProgressChanged={refreshProgress}
            />
          </div>
        }
      />

      <Step
        n={5}
        title="Add your first menu items"
        done={menuDone}
        body={
          <>
            <p className="text-sm text-muted-foreground">
              {menuDone
                ? 'You have a publishable item with a complete allergen declaration.'
                : 'Add at least one available, approved item and declare its allergens or explicitly confirm it is free from all 14. The full editor is in the menu section.'}
            </p>
            <Link
              href={termsDone ? '/menu/import' : '/onboarding/terms'}
              className="mt-2 inline-block"
            >
              <Button variant="outline" size="sm" className="gap-2">
                <Upload className="h-4 w-4" /> Open menu builder
              </Button>
            </Link>
            {!termsDone && (
              <p className="mt-2 text-xs font-medium text-amber-700">
                Accept the Vendor Terms first to unlock menu setup.
              </p>
            )}
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

const REQUIRED_ONBOARDING_ITEMS: Array<{
  name: RequiredOnboardingItemName;
  label: string;
  help: string;
  evidenceHref: string;
}> = [
  {
    name: 'food_business_registration',
    label: 'Food Business Registration',
    help: 'Register with your local council at least 28 days before trading.',
    evidenceHref: '/account-and-compliance#doc-kitchen_reg',
  },
  {
    name: 'fhrs_eligibility',
    label: 'FSA / FHRS',
    help: 'You can trade while awaiting your first inspection; an existing rating below 3 is not eligible.',
    evidenceHref: '/account-and-compliance',
  },
  {
    name: 'public_liability_insurance',
    label: 'Public liability insurance',
    help: 'Compare providers for cover of at least £5m and check that catering and delivery work are included.',
    evidenceHref: '/account-and-compliance#doc-insurance',
  },
  {
    name: 'food_safety_certificate',
    label: 'Level 2 Food Safety certificate',
    help: 'Take a recognised Level 2 Food Safety course and keep the certificate available for review.',
    evidenceHref: '/account-and-compliance#doc-hygiene_cert',
  },
  {
    name: 'photo_id_verification',
    label: 'Photo ID',
    help: 'Your ID is used only for verification, stored securely, and accessed by authorised compliance staff.',
    evidenceHref: '/account-and-compliance#doc-photo_id',
  },
];

/**
 * Horizontal step indicator rendered above the four step cards.
 *
 * - Circle border + fill colour shifts as the vendor advances:
 *   future steps = muted cream, current = white-on-brand outline,
 *   complete = solid brand with a check.
 * - Connector line between circles fills brand green once a step is
 *   passed, giving the same visual "progress bar" cue Stripe and
 *   Deliveroo use on their partner onboarding flows.
 * - The whole strip is decorative for AT users - the underlying step
 *   cards already announce their done/active state via the existing
 *   `<Step>` heading and badge - so we mark it `aria-hidden`.
 */
function StepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        padding: '16px',
        background: 'white',
        border: `1px solid ${brandColors.cream.border}`,
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
                    background: isDone ? brandColors.brand.DEFAULT : brandColors.cream.border,
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
                  borderColor:
                    isDone || isCurrent ? brandColors.brand.DEFAULT : brandColors.charcoal.soft,
                  background: isDone
                    ? brandColors.brand.DEFAULT
                    : isCurrent
                      ? 'white'
                      : brandColors.cream.muted,
                  // Numeral colours kept WCAG AA at small sizes (green rebrand):
                  //   future = charcoal-mid on cream-muted → ~6:1
                  //   current = brand-dark on white → ~8.6:1
                  //   done = white on brand green → ~4.9:1
                  color: isDone
                    ? 'white'
                    : isCurrent
                      ? brandColors.brand.dark
                      : brandColors.charcoal.mid,
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
                  // charcoal-mid on white is ~7.5:1, well above WCAG AA -
                  // the spec's #9B9894 was 3.2:1 and would have failed at
                  // this size.
                  color:
                    isDone || isCurrent ? brandColors.charcoal.DEFAULT : brandColors.charcoal.mid,
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
