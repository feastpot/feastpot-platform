'use client';

import { AlertTriangle, CheckCircle2, LockKeyhole } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { brandColors } from '@feastpot/ui/brand';

import { useCreateStripeConnectSession } from '@/hooks/use-stripe-connect';

type EntityType = 'SOLE_TRADER' | 'LIMITED_COMPANY';

interface StripeAccountOnboardingProps {
  existingAccountId?: string | null;
  payoutsEnabled: boolean;
  onProgressChanged: () => void;
}

export function StripeAccountOnboarding({
  existingAccountId,
  payoutsEnabled,
  onProgressChanged,
}: StripeAccountOnboardingProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [entityType, setEntityType] = useState<EntityType>();
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exited, setExited] = useState(false);
  const session = useCreateStripeConnectSession();
  const createSessionRef = useRef(session.mutateAsync);
  createSessionRef.current = session.mutateAsync;

  useEffect(() => {
    if (!started || initialized.current || !mountRef.current) return;
    const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
      setError('Stripe is not available right now. Please try again later or contact support.');
      return;
    }
    let cancelled = false;
    const mountElement = mountRef.current;
    initialized.current = true;
    void (async () => {
      try {
        const { loadConnectAndInitialize } = await import('@stripe/connect-js');
        const connect = loadConnectAndInitialize({
          publishableKey,
          fetchClientSecret: async () => {
            const result = await createSessionRef.current(entityType);
            return result.clientSecret;
          },
          appearance: {
            variables: {
              colorPrimary: brandColors.brand.DEFAULT,
              colorBackground: '#FFFFFF',
              colorText: brandColors.charcoal.DEFAULT,
              colorDanger: brandColors.scotch,
              borderRadius: '12px',
              spacingUnit: '12px',
            },
          },
        });
        const onboarding = connect.create('account-onboarding');
        onboarding.setCollectionOptions({
          fields: 'currently_due',
          futureRequirements: 'omit',
        });
        onboarding.setOnExit(() => {
          setExited(true);
          onProgressChanged();
        });
        onboarding.setOnStepChange(onProgressChanged);
        if (!cancelled) mountElement.appendChild(onboarding);
      } catch (cause) {
        initialized.current = false;
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Stripe could not load.');
      }
    })();
    return () => {
      cancelled = true;
      mountElement.replaceChildren();
    };
  }, [started, entityType, onProgressChanged]);

  useEffect(() => {
    if (!started) return;
    const timer = window.setInterval(onProgressChanged, 12_000);
    return () => window.clearInterval(timer);
  }, [started, onProgressChanged]);

  if (!started) {
    if (existingAccountId) {
      return (
        <div className="space-y-3">
          {payoutsEnabled && (
            <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
              <div>
                <p className="font-semibold text-green-950">Payout details are ready</p>
                <p className="mt-1 text-sm text-green-900">
                  Stripe has confirmed your account can receive weekly payouts.
                </p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setStarted(true)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            {payoutsEnabled ? 'Review Stripe details' : 'Continue Stripe setup'}
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-dark">
          Are you cooking as yourself, or through a registered company?
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setEntityType('SOLE_TRADER');
              setStarted(true);
            }}
            className="rounded-xl border border-border bg-white p-4 text-left transition-colors hover:border-teal hover:bg-accent"
          >
            <span className="font-semibold text-dark">As yourself</span>
            <span className="mt-1 block text-xs text-mid">
              You are a sole trader or individual cook.
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEntityType('LIMITED_COMPANY');
              setStarted(true);
            }}
            className="rounded-xl border border-border bg-white p-4 text-left transition-colors hover:border-teal hover:bg-accent"
          >
            <span className="font-semibold text-dark">Through a registered company</span>
            <span className="mt-1 block text-xs text-mid">
              Your business is registered as a limited company.
            </span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4 text-sm text-mid">
        <div className="flex items-start gap-3">
          <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-teal" />
          <p>
            Details entered in this Stripe form go directly to Stripe and are encrypted. Feastpot
            never sees the full NI number or bank account number entered here, and customers never
            see them. Stripe collects these details for weekly payouts and identity checks. Feastpot
            separately asks for the tax identifier it must report under UK law.
          </p>
        </div>
      </div>
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>{error}</p>
            <button
              type="button"
              className="mt-2 font-semibold underline"
              onClick={() => {
                setError(null);
                initialized.current = false;
                setStarted(false);
              }}
            >
              Try again
            </button>
          </div>
        </div>
      )}
      {!error && (
        <>
          <div ref={mountRef} className="min-h-[180px]" aria-label="Stripe account onboarding" />
          {exited && (
            <p className="text-sm text-mid">
              Your progress is saved. Return here any time to finish the remaining details.
            </p>
          )}
        </>
      )}
    </div>
  );
}
