'use client';

import { cn } from '@feastpot/ui';
import {
  AlertTriangle,
  Camera,
  ChevronRight,
  Clock,
  FileText,
  ShieldCheck,
  Store,
  Upload,
} from 'lucide-react';
import { useRef, useState } from 'react';

import type { VendorDocument, VendorDocumentType } from '@/hooks/use-vendor-documents';
import { formatDate } from '@/lib/format';

import {
  COMPLIANCE_STATE_META,
  daysUntil,
  deriveComplianceState,
  type ComplianceState,
} from './compliance-status';

/**
 * Required compliance documents shown in both the onboarding wizard
 * (Step 2) and the standalone `/compliance` tab. Kept in one place so
 * the two views never drift out of sync.
 *
 * Copy follows the spec's structure: one-sentence justification + a
 * checklist of what the document must show. Verifiable URLs
 * (food.gov.uk) are surfaced for the registration step as a separate
 * hint.
 */
export const REQUIRED_DOCS: ReadonlyArray<{
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
    acceptedFiles: 'PDF, JPG or PNG, max 10 MB',
  },
  {
    type: 'insurance',
    label: 'Public liability insurance',
    why: 'Protects you and your customers. Minimum £5m cover required.',
    mustShow: ['Your name or business name', 'Policy number', 'Coverage amount', 'Expiry date'],
    acceptedFiles: 'PDF, JPG or PNG, max 10 MB',
  },
  {
    type: 'photo_id',
    label: 'Photo ID',
    why: 'Passport or driving licence, used for identity verification only.',
    mustShow: ['Clear photo of the document', 'Name matches your account', 'Document not expired'],
    acceptedFiles: 'PDF, JPG or PNG, max 10 MB',
  },
  {
    type: 'kitchen_reg',
    label: 'Food business registration',
    why: 'Required under the Food Safety Act 1990. Register for free at your local council, usually 1 to 2 weeks. Guidance: https://www.food.gov.uk/business-guidance/register-a-food-business',
    mustShow: ['Your name or business name', 'Issuing council', 'Registration date'],
    acceptedFiles: 'PDF, JPG or PNG, max 10 MB',
  },
];

/** Lookup of just the required document types, for the dashboard summariser. */
export const REQUIRED_DOC_TYPES: ReadonlyArray<VendorDocumentType> = REQUIRED_DOCS.map((d) => d.type);

/** Decorative icon tile per doc type — matches the Vendor4 mockup. */
const DOC_ICON: Record<VendorDocumentType, { Icon: typeof FileText; bg: string; fg: string }> = {
  hygiene_cert: { Icon: FileText, bg: 'bg-red-100', fg: 'text-red-600' },
  insurance: { Icon: ShieldCheck, bg: 'bg-amber-100', fg: 'text-amber-600' },
  photo_id: { Icon: Camera, bg: 'bg-red-100', fg: 'text-red-600' },
  kitchen_reg: { Icon: Store, bg: 'bg-amber-100', fg: 'text-amber-600' },
  // Bank details is not in REQUIRED_DOCS today but the type exists, so
  // provide a fallback so the lookup is always defined.
  bank_details: { Icon: FileText, bg: 'bg-surface', fg: 'text-mid' },
};

const STATE_TEXT: Record<ComplianceState, string> = {
  not_started: 'Not started',
  submitted: 'Submitted',
  approved: 'Approved',
  needs_changes: 'Needs changes',
  expiring_soon: 'Expiring soon',
  expired: 'Expired',
};

const STATE_BADGE: Record<ComplianceState, string> = {
  not_started: 'border-red-200 bg-red-50 text-red-700',
  submitted: 'border-teal-light bg-teal-light text-teal-dark',
  approved: 'border-teal/40 bg-teal-light text-teal-dark',
  needs_changes: 'border-red-300 bg-red-50 text-red-700',
  expiring_soon: 'border-amber-300 bg-amber-50 text-amber-700',
  expired: 'border-red-300 bg-red-50 text-red-700',
};

const STATE_LEFT_BAR: Record<ComplianceState, string> = {
  not_started: 'bg-red-400',
  submitted: 'bg-teal',
  approved: 'bg-teal',
  needs_changes: 'bg-red-500',
  expiring_soon: 'bg-amber-500',
  expired: 'bg-red-500',
};

export function ComplianceStateBadge({ state }: { state: ComplianceState }) {
  const meta = COMPLIANCE_STATE_META[state];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        STATE_BADGE[state],
      )}
    >
      {state === 'submitted' && <Clock className="h-3 w-3" aria-hidden />}
      {(state === 'expiring_soon' || state === 'expired' || state === 'needs_changes') && (
        <AlertTriangle className="h-3 w-3" aria-hidden />
      )}
      {meta.label}
    </span>
  );
}

/**
 * A single row in the compliance document list. Pure presentation —
 * takes its current document (if any) and an `onPick` handler so the
 * same component works for onboarding (initial upload) and the
 * standalone `/compliance` page (replace).
 *
 * Visual update: now uses the mockup's icon-tile + 4-column layout
 * (icon/meta + expires/upload + state badge + requirements checklist)
 * with a colored left bar driven by the doc's derived state. The
 * underlying file-input + date-picker behaviour is unchanged.
 */
export function DocumentRow({
  anchorId,
  type: typeProp,
  label,
  why,
  mustShow,
  acceptedFiles,
  doc,
  uploading,
  onPick,
}: {
  /**
   * Optional DOM id used by the "View missing" CTA on the standalone
   * page to scroll a specific doc into view. Omitted on the
   * onboarding wizard where there's nothing to scroll to.
   */
  anchorId?: string;
  /**
   * Preferred — the canonical doc type. When omitted, we fall back to
   * label-based inference so existing callers (the onboarding wizard
   * pre-redesign) keep working. New callers should always pass this
   * explicitly so future label tweaks don't silently break the
   * icon / checklist copy.
   */
  type?: VendorDocumentType;
  label: string;
  why: string;
  mustShow: string[];
  acceptedFiles: string;
  doc: VendorDocument | null;
  uploading: boolean;
  onPick: (file: File, expiresAt?: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [expiresAt, setExpiresAt] = useState('');
  const state = deriveComplianceState(doc);
  const days = daysUntil(doc?.expiresAt ?? null);
  const type = typeProp ?? inferTypeFromLabel(label);
  const iconMeta = DOC_ICON[type] ?? DOC_ICON.bank_details;
  const { Icon } = iconMeta;

  // Per-requirement checklist on the right. Each item shows the state
  // text ("Not started" / "Submitted" / "Approved" / etc.) — same
  // overall state as the doc, but split into the three concerns
  // shown in the mockup.
  const checklist = [
    { label: 'Document uploaded', met: !!doc },
    {
      // Distinct copy for Photo ID per the mockup ("Not expired") vs
      // other docs ("Within date").
      label: type === 'photo_id' ? 'Not expired' : 'Within date',
      met: !!doc && state !== 'expired' && state !== 'expiring_soon',
    },
    {
      label: 'Clear & readable',
      met: doc?.status === 'verified',
    },
  ];

  return (
    <article
      id={anchorId}
      className="fp-card relative overflow-hidden border border-border bg-white"
    >
      {/* Color-coded state bar, full height on the left edge. */}
      <span aria-hidden className={cn('absolute inset-y-0 right-0 w-1', STATE_LEFT_BAR[state])} />

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
        {/* Left: icon + name + description + expandable details */}
        <div className="flex items-start gap-3">
          <span aria-hidden className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-xl', iconMeta.bg)}>
            <Icon className={cn('h-6 w-6', iconMeta.fg)} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-dark">{label}</p>
            <p className="mt-0.5 text-xs text-mid">{why}</p>
            <details className="mt-1.5 text-xs">
              <summary className="cursor-pointer select-none font-semibold text-teal hover:text-teal-dark">
                What this document must show
              </summary>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-mid">
                {mustShow.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
              <p className="mt-1.5 italic text-mid">{acceptedFiles}</p>
            </details>
            {doc && (
              <p className="mt-2 text-[11px] text-mid">
                {doc.fileName ?? '(file)'}
                {doc.expiresAt ? ` · expires ${formatDate(doc.expiresAt)}` : ' · no expiry set'}
                {state === 'expiring_soon' && days !== null && (
                  <span className="ml-1 font-semibold text-amber-700">
                    ({days} day{days === 1 ? '' : 's'} left)
                  </span>
                )}
                {state === 'expired' && (
                  <span className="ml-1 font-semibold text-red-700">(expired, please replace)</span>
                )}
              </p>
            )}
            {state === 'needs_changes' && doc?.rejectReason && (
              <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                <strong>Reviewer note:</strong> {doc.rejectReason}
              </p>
            )}
          </div>
        </div>

        {/* Middle: expires date + upload button */}
        <div className="space-y-2">
          <div className="space-y-1">
            <label
              htmlFor={`exp-${anchorId ?? label}`}
              className="block text-[11px] font-semibold text-dark"
            >
              Expires (optional)
            </label>
            <input
              id={`exp-${anchorId ?? label}`}
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-white px-2 text-sm text-dark focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/30"
            />
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-dark transition-colors hover:bg-surface disabled:opacity-60"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden />
            {doc ? 'Replace document' : 'Upload document'}
          </button>
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

        {/* Right (state badge column) */}
        <div className="flex flex-col items-start gap-1 lg:items-center">
          <ComplianceStateBadge state={state} />
          {state === 'not_started' && (
            <span className="text-[11px] font-semibold text-red-600">Required</span>
          )}
        </div>

        {/* Far right: requirements checklist */}
        <div className="rounded-lg border border-border bg-surface px-3 py-2.5 text-xs">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-mid">
            All required
          </p>
          <p className="text-[11px] font-semibold text-dark">{STATE_TEXT[state]}</p>
          <ul className="mt-2 space-y-1.5">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-dark">
                  <span
                    aria-hidden
                    className={cn(
                      'inline-block h-2 w-2 rounded-full',
                      c.met ? 'bg-teal' : 'bg-border',
                    )}
                  />
                  {c.label}
                </span>
                <span className="text-[10px] text-mid">{c.met ? 'Done' : STATE_TEXT[state]}</span>
              </li>
            ))}
          </ul>
          <ChevronRight className="ml-auto mt-1 h-3.5 w-3.5 text-mid" aria-hidden />
        </div>
      </div>
    </article>
  );
}

/**
 * The label-driven inference is brittle but unavoidable here: the
 * caller passes the human label rather than the type to keep the
 * component reusable across onboarding (which doesn't have the
 * REQUIRED_DOCS map in scope at the call site). We map back via a
 * prefix match against the known REQUIRED_DOCS list and fall back
 * to bank_details (the catch-all icon) on misses.
 */
function inferTypeFromLabel(label: string): VendorDocumentType {
  const hit = REQUIRED_DOCS.find((d) => d.label === label);
  return hit?.type ?? 'bank_details';
}
