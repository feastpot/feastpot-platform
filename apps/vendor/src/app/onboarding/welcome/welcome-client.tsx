'use client';

import { Button, Card, CardContent } from '@feastpot/ui';
import { Check, CircleAlert } from 'lucide-react';
import Link from 'next/link';

import type { OnboardingProgress, OnboardingStep } from '@/hooks/use-onboarding-progress';

const STEP_LINKS: Record<string, { href: string; cta: string }> = {
  food_business_registration: { href: '/compliance', cta: 'Open compliance' },
  public_liability_insurance: { href: '/compliance', cta: 'Upload insurance' },
  food_safety_certificate: { href: '/compliance', cta: 'Upload certificate' },
  photo_id_verification: { href: '/compliance', cta: 'Upload photo ID' },
  stripe_connect: { href: '/payouts', cta: 'Complete Stripe' },
  vendor_terms: { href: '/onboarding/terms', cta: 'Accept terms' },
  tax_profile: { href: '/tax-information', cta: 'Complete tax profile' },
  allergen_declared_menu_item: { href: '/menu', cta: 'Open menu builder' },
  fhrs_eligibility: { href: '/compliance', cta: 'Review FHRS status' },
  menu_photography: { href: '/menu', cta: 'Add menu photos' },
  optional_profile_content: { href: '/settings/profile', cta: 'Edit profile' },
  vendor_pro_subscription: { href: '/settings', cta: 'View options' },
};

function StepRow({ step }: { step: OnboardingStep }) {
  const link = STEP_LINKS[step.name];
  return (
    <li>
      <Card className={step.blocksPublication && !step.complete ? 'border-amber-300' : undefined}>
        <CardContent className="flex items-start gap-3 p-4">
          <span
            className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${
              step.complete
                ? 'bg-teal text-white'
                : step.blocksPublication
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {step.complete ? <Check className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">{step.label}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs capitalize">
                {step.state.replaceAll('_', ' ')}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{step.sourceCitation}</p>
            {!step.complete && link && (
              <Link href={link.href} className="mt-2 inline-block">
                <Button variant="outline" size="sm">
                  {link.cta}
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

export function WelcomeClient({
  businessName,
  progress,
}: {
  businessName: string;
  progress: OnboardingProgress;
}) {
  const publicationSteps = progress.steps.filter((step) => step.blocksPublication);
  const optionalSteps = progress.steps.filter((step) => !step.blocksPublication);
  const completedHard = publicationSteps.filter((step) => step.complete).length;
  const pct = Math.round((completedHard / publicationSteps.length) * 100);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Welcome to Feastpot, {businessName}</h1>
        <p className="text-sm text-muted-foreground">
          Work through onboarding in any order. Items marked “blocks go-live” must be complete
          before customers can discover you or place orders.
        </p>
      </header>

      <Card className={progress.canProfileGoLive ? 'border-teal/40 bg-teal/5' : 'border-amber-300'}>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between text-sm font-medium">
            <span>{progress.canProfileGoLive ? 'Ready to go live' : 'Go-live requirements'}</span>
            <span className="text-muted-foreground">
              {completedHard} of {publicationSteps.length} complete
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Blocks go-live</h2>
        <ol className="space-y-3">
          {publicationSteps.map((step) => (
            <StepRow key={step.name} step={step} />
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Optional improvements</h2>
        <p className="mb-2 text-sm text-muted-foreground">
          These can improve your profile but never prevent publication.
        </p>
        <ol className="space-y-3">
          {optionalSteps.map((step) => (
            <StepRow key={step.name} step={step} />
          ))}
        </ol>
      </section>
    </div>
  );
}
