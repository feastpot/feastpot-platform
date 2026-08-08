'use client';

import { AlertTriangle, CheckCircle2, ChevronRight, ExternalLink } from 'lucide-react';

import type { EnforcementAction, ReasonCode } from '@/hooks/use-account-status';
import { REASON_CODE_LABELS, REASON_CODE_RESOLVE_STEPS, useAccountStatus } from '@/hooks/use-account-status';

const ACTION_TYPE_LABELS: Record<string, string> = {
  RESTRICTION: 'Restriction',
  SUSPENSION: 'Suspension',
  TERMINATION: 'Termination notice',
};

const ACTION_TYPE_COLOURS: Record<string, string> = {
  RESTRICTION: 'bg-amber-100 text-amber-800',
  SUSPENSION: 'bg-red-100 text-red-800',
  TERMINATION: 'bg-red-200 text-red-900',
};

const CLAUSE_REF = '14.1';
const APPEAL_CLAUSE_REF = '18.1';
const APPEAL_EMAIL = 'appeals@feastpot.co.uk';
const APPEAL_WINDOW_DAYS = 14;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function appealDeadline(effectiveAt: string): string {
  const d = new Date(new Date(effectiveAt).getTime() + APPEAL_WINDOW_DAYS * 86_400_000);
  return formatDate(d.toISOString());
}

function appealSubject(action: EnforcementAction): string {
  return `Appeal: ${action.reasonCode} (${action.id})`;
}

interface ActionCardProps {
  action: EnforcementAction;
}

function ActionCard({ action }: ActionCardProps) {
  const resolveStep = REASON_CODE_RESOLVE_STEPS[action.reasonCode as ReasonCode];
  const deadline = appealDeadline(action.effectiveAt);
  const isExpiredAppeal = new Date() > new Date(new Date(action.effectiveAt).getTime() + APPEAL_WINDOW_DAYS * 86_400_000);

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" aria-hidden />
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${ACTION_TYPE_COLOURS[action.actionType] ?? 'bg-neutral-100 text-neutral-700'}`}>
          {ACTION_TYPE_LABELS[action.actionType] ?? action.actionType}
        </span>
        <span className="text-sm font-semibold text-red-800">
          {REASON_CODE_LABELS[action.reasonCode as ReasonCode] ?? action.reasonCode}
        </span>
      </div>

      {/* Dates */}
      <div className="mb-3 flex flex-wrap gap-4 text-[12px] text-red-700">
        <span><strong>Effective:</strong> {formatDate(action.effectiveAt)}</span>
        {!isExpiredAppeal && <span><strong>Appeal deadline:</strong> {deadline}</span>}
      </div>

      {/* Narrative */}
      <div className="mb-4 rounded-xl border border-red-200 bg-white p-4">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-red-400">
          Statement of reasons (clause {CLAUSE_REF})
        </p>
        <p className="text-sm leading-relaxed text-neutral-800">{action.reasonNarrative}</p>
      </div>

      {/* What to do */}
      {resolveStep && (
        <div className="mb-4">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-red-600">
            What to do
          </p>
          <p className="text-sm leading-relaxed text-neutral-700">{resolveStep}</p>
        </div>
      )}

      {/* Appeal */}
      <div className="rounded-xl border border-red-200 bg-white p-4">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-neutral-500">
          Your right to appeal (clause {APPEAL_CLAUSE_REF})
        </p>
        {isExpiredAppeal ? (
          <p className="text-sm text-neutral-500">The 14-day appeal window for this action has closed.</p>
        ) : (
          <>
            <p className="mb-3 text-sm leading-relaxed text-neutral-700">
              You may appeal this decision within 14 days of the effective date. Email us with your grounds
              of appeal and we will acknowledge receipt within 5 business days.
            </p>
            <a
              href={`mailto:${APPEAL_EMAIL}?subject=${encodeURIComponent(appealSubject(action))}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
            >
              Appeal this decision
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
            <p className="mt-2 text-[11px] text-neutral-500">Deadline: {deadline}</p>
          </>
        )}
      </div>
    </div>
  );
}

export function AccountStatusClient() {
  const { data: actions = [], isLoading, error } = useAccountStatus();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((n) => (
          <div key={n} className="h-40 animate-pulse rounded-2xl bg-neutral-100" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700" role="alert">
        Unable to load account status. Please refresh or contact support.
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-green-500" aria-hidden />
        <p className="text-base font-semibold text-green-800">Your account is in good standing</p>
        <p className="mt-1 text-sm text-green-700">
          There are no active enforcement actions against your listing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>{actions.length} active enforcement {actions.length === 1 ? 'action' : 'actions'}</strong>
        {' '}on your account. Every action includes a written statement of reasons and a 14-day
        right of appeal under vendor terms clause 18.1.
      </div>
      {actions.map((action) => (
        <ActionCard key={action.id} action={action} />
      ))}
      <div className="text-[12px] text-neutral-500">
        Questions? Contact{' '}
        <a href="mailto:support@feastpot.co.uk" className="underline hover:text-neutral-700">
          support@feastpot.co.uk
        </a>
        {' '}or visit the{' '}
        <a href="/help" className="inline-flex items-center gap-0.5 underline hover:text-neutral-700">
          Help centre <ChevronRight className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}
