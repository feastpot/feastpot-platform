'use client';

import { Badge, Button } from '@feastpot/ui';
import { AlertTriangle, Clock, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { Label } from '@/components/ui/label';
import type { VendorDocument, VendorDocumentType } from '@/hooks/use-vendor-documents';
import { formatDate } from '@/lib/format';

import {
  COMPLIANCE_STATE_META,
  daysUntil,
  deriveComplianceState,
  type ComplianceState,
} from './compliance-status';

/**
 * Required compliance documents shown in both the onboarding wizard (Step 2)
 * and the standalone `/compliance` tab. Kept in one place so the two views
 * never drift out of sync.
 *
 * Copy follows the spec's structure: one-sentence justification + a
 * checklist of what the document must show. Verifiable URLs (food.gov.uk)
 * are surfaced for the registration step as a separate hint.
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

const TONE_CLASSES: Record<NonNullable<ReturnType<typeof toneFor>>, string> = {
  gray: 'border-border bg-muted text-foreground',
  vendor: 'border-vendor/30 bg-vendor/10 text-vendor-dark',
  // Brand teal on bg-teal/10 hovers around 3:1 at xs size, below WCAG AA
  // for small text. Use the darker variant for legibility.
  teal: 'border-teal/40 bg-teal/10 text-teal-dark',
  amber: 'border-amber-300 bg-amber-50 text-amber-900',
  red: 'border-red-300 bg-red-50 text-red-900',
};

function toneFor(state: ComplianceState) {
  return COMPLIANCE_STATE_META[state].tone;
}

export function ComplianceStateBadge({ state }: { state: ComplianceState }) {
  const meta = COMPLIANCE_STATE_META[state];
  return (
    <Badge variant="outline" className={`gap-1 ${TONE_CLASSES[meta.tone]}`}>
      {state === 'submitted' && <Clock className="h-3 w-3" />}
      {(state === 'expiring_soon' || state === 'expired' || state === 'needs_changes') && (
        <AlertTriangle className="h-3 w-3" />
      )}
      {meta.label}
    </Badge>
  );
}

/**
 * A single row in the compliance document list. Pure presentation, takes
 * its current document (if any) and an `onPick` handler so the same row
 * works for onboarding (initial upload) and `/compliance` (replace).
 */
export function DocumentRow({
  label,
  why,
  mustShow,
  acceptedFiles,
  doc,
  uploading,
  onPick,
}: {
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

  return (
    <div className="rounded-md border border-input p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{why}</p>
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
        <ComplianceStateBadge state={state} />
      </div>

      {doc && (
        <p className="mt-2 text-xs text-muted-foreground">
          {doc.fileName ?? '(file)'}
          {doc.expiresAt ? ` · expires ${formatDate(doc.expiresAt)}` : ' · no expiry set'}
          {state === 'expiring_soon' && days !== null && (
            <span className="ml-1 font-medium text-amber-800">
              ({days} day{days === 1 ? '' : 's'} left)
            </span>
          )}
          {state === 'expired' && (
            <span className="ml-1 font-medium text-red-800">(expired, please replace)</span>
          )}
        </p>
      )}

      {state === 'needs_changes' && doc?.rejectReason && (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          <strong>Reviewer note:</strong> {doc.rejectReason}
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
          {doc ? 'Replace' : 'Upload'}
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
