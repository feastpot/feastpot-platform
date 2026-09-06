'use client';

import { Clock3, CircleCheck, CircleX, FileClock, Info } from 'lucide-react';
import { useMemo } from 'react';

import { useMenuModerationPolicy, type MenuItem } from '@/hooks/use-menu-items';

const FALLBACK_POLICY = {
  mode: 'manual_pilot',
  turnaroundHours: 72,
  label: 'Manual pilot approval',
} as const;

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function ageLabel(value?: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
  if (hours < 1) return 'less than an hour ago';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h ago`;
}

export function ModerationPolicyBanner({ vendorId }: { vendorId: string }) {
  const policy = useMenuModerationPolicy(vendorId);
  const current = policy.data ?? FALLBACK_POLICY;
  return (
    <div className="mb-5 flex gap-3 rounded-2xl border border-brand/20 bg-brand-light/20 px-4 py-3 text-[13px] text-charcoal">
      <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand" aria-hidden />
      <div>
        <p className="font-semibold">{current.label ?? 'Manual pilot approval'} is on</p>
        <p className="mt-0.5 text-charcoal-mid">
          New dishes and substantive edits go to a safety review. The promised turnaround is{' '}
          <span className="font-semibold text-charcoal">{current.turnaroundHours || 72} hours</span>
          .
        </p>
      </div>
    </div>
  );
}

export function ModerationStatus({ item }: { item: MenuItem }) {
  const submitted = ageLabel(item.moderationSubmittedAt);
  const due = formatDate(item.slaDueAt);
  const moderated = formatDate(item.moderatedAt);

  if (item.moderationStatus === 'held') {
    return (
      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
        <div className="flex items-center gap-1.5 font-semibold">
          <Clock3 className="h-3.5 w-3.5" aria-hidden /> Pending safety review
        </div>
        <p className="mt-1">
          {submitted ? `Submitted ${submitted}. ` : ''}
          {due ? `Expected by ${due}.` : 'We aim to review within 72 hours.'}
          {item.isModerationOverdue ? ' This review is overdue; our team has been notified.' : ''}
        </p>
      </div>
    );
  }

  if (item.moderationStatus === 'rejected') {
    return (
      <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-900">
        <div className="flex items-center gap-1.5 font-semibold">
          <CircleX className="h-3.5 w-3.5" aria-hidden /> Needs correction
        </div>
        {item.moderationReason && <p className="mt-1">Reason: {item.moderationReason}</p>}
        <p className="mt-1 font-medium">Update the dish and save it to send it back for review.</p>
        {moderated && <p className="mt-1 text-red-800/70">Reviewed {moderated}.</p>}
      </div>
    );
  }

  if (item.moderationStatus === 'approved' || item.moderationStatus === 'auto_approved') {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-green-700">
        <CircleCheck className="h-3.5 w-3.5" aria-hidden /> Live and approved
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-charcoal-mid">
      <FileClock className="h-3.5 w-3.5" aria-hidden /> Save when ready to submit for review
    </div>
  );
}

export function ModerationSummary({ items }: { items: MenuItem[] }) {
  const counts = useMemo(
    () => ({
      pending: items.filter((item) => item.moderationStatus === 'held').length,
      corrections: items.filter((item) => item.moderationStatus === 'rejected').length,
    }),
    [items],
  );
  if (!counts.pending && !counts.corrections) return null;
  return (
    <div className="mb-5 flex flex-wrap gap-x-5 gap-y-1 rounded-xl bg-cream-warm px-4 py-3 text-[12px] text-charcoal-mid">
      {counts.pending > 0 && (
        <span>
          <strong className="text-charcoal">{counts.pending}</strong> pending safety review
        </span>
      )}
      {counts.corrections > 0 && (
        <span>
          <strong className="text-charcoal">{counts.corrections}</strong> need correction
        </span>
      )}
    </div>
  );
}
