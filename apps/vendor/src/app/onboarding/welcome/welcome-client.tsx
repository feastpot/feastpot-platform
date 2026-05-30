'use client';

import { Button, Card, CardContent } from '@feastpot/ui';
import { Check } from 'lucide-react';
import Link from 'next/link';

export interface OnboardingProgress {
  profileComplete: boolean;
  documentsComplete: boolean;
  stripeComplete: boolean;
  menuComplete: boolean;
  deliveryComplete: boolean;
  allComplete: boolean;
  completedCount: number;
  totalSteps: number;
}

interface StepDef {
  key: keyof Pick<
    OnboardingProgress,
    'profileComplete' | 'documentsComplete' | 'stripeComplete' | 'menuComplete' | 'deliveryComplete'
  >;
  title: string;
  description: string;
  href: string;
  cta: string;
}

const STEPS: StepDef[] = [
  {
    key: 'profileComplete',
    title: 'Complete your profile',
    description: 'Add your bio, a photo, and your kitchen story.',
    href: '/settings/profile',
    cta: 'Edit profile',
  },
  {
    key: 'documentsComplete',
    title: 'Upload compliance documents',
    description: 'All four required documents must be uploaded.',
    href: '/compliance',
    cta: 'Upload documents',
  },
  {
    key: 'stripeComplete',
    title: 'Connect Stripe for payouts',
    description: 'Connect your account so we can pay you for orders.',
    href: '/payouts',
    cta: 'Connect Stripe',
  },
  {
    key: 'menuComplete',
    title: 'Build your menu',
    description: 'Add at least one available item to your menu.',
    href: '/menu',
    cta: 'Open menu builder',
  },
  {
    key: 'deliveryComplete',
    title: 'Set your delivery area and hours',
    description: 'Tell us where and when you deliver.',
    href: '/settings/delivery',
    cta: 'Set delivery area',
  },
];

export function WelcomeClient({
  businessName,
  progress,
}: {
  businessName: string;
  progress: OnboardingProgress;
}) {
  const pct = Math.round((progress.completedCount / progress.totalSteps) * 100);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold">Welcome to Feastpot, {businessName}</h1>
        <p className="text-sm text-muted-foreground">
          Complete these steps to get your kitchen ready to take orders.
        </p>
      </header>

      <Card>
        <CardContent className="p-4">
          <div className="mb-2 flex items-center justify-between text-sm font-medium">
            <span>Your progress</span>
            <span className="text-muted-foreground">
              {progress.completedCount} of {progress.totalSteps} complete
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-teal transition-all" style={{ width: `${pct}%` }} />
          </div>
        </CardContent>
      </Card>

      <ol className="space-y-3">
        {STEPS.map((step, i) => {
          const done = progress[step.key];
          return (
            <li key={step.key}>
              <Card>
                <CardContent className="flex items-start gap-3 p-4">
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-medium ${
                      done ? 'bg-teal text-white' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {done ? <Check className="h-4 w-4" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className={`font-medium ${done ? 'text-teal' : ''}`}>{step.title}</h2>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                    {!done && (
                      <Link href={step.href} className="mt-2 inline-block">
                        <Button variant="outline" size="sm">
                          {step.cta}
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>

      <Card className="border-teal/40 bg-teal/5">
        <CardContent className="space-y-1 p-4 text-sm">
          <p className="font-medium">Your kitchen goes live once all steps are complete.</p>
          <p className="text-muted-foreground">
            Need help? Email{' '}
            <a href="mailto:vendors@feastpot.co.uk" className="underline hover:no-underline">
              vendors@feastpot.co.uk
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
