'use client';

import {
  Button,
  DialogDescription,
  DialogTitle,
  Sheet,
  SheetContent,
  cn,
} from '@feastpot/ui';
import { useEffect, useState } from 'react';

// Sheet + Dialog are both backed by `@radix-ui/react-dialog` in @feastpot/ui,
// so DialogTitle / DialogDescription render correctly inside SheetContent and
// satisfy Radix's a11y requirement for a labelled dialog. The shared package
// doesn't export SheetTitle / SheetDescription primitives.

const REASONS = [
  { value: 'Out of stock', label: 'Out of stock' },
  { value: 'At capacity', label: 'At capacity' },
  { value: 'Other', label: 'Other' },
] as const;

export interface RejectSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  busy?: boolean;
  /** Reason is the FREE-TEXT reason transmitted to the API. */
  onConfirm: (reason: string) => void;
}

/**
 * Bottom-sheet rejection confirmation. Replaces the older free-text
 * RejectDialog with a structured reason picker per the brief — vendors
 * usually reject for one of three reasons and a structured value is far
 * easier for support to triage later.
 *
 * "Other" reveals a small free-text input so we still capture the long
 * tail; the API contract requires a 3–500 char reason string regardless of
 * source so we validate before allowing confirm.
 */
export function RejectSheet({
  open,
  onOpenChange,
  orderNumber,
  busy,
  onConfirm,
}: RejectSheetProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [otherText, setOtherText] = useState('');

  // Reset the form whenever the sheet closes — so reopening it for another
  // order doesn't carry over the previous selection.
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setOtherText('');
    }
  }, [open]);

  const isOther = picked === 'Other';
  const finalReason = isOther ? otherText.trim() : picked ?? '';
  const canConfirm = finalReason.length >= 3 && finalReason.length <= 500 && !busy;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <div className="space-y-1 pr-6">
          <DialogTitle className="text-lg font-bold text-dark">
            Reject order {orderNumber}?
          </DialogTitle>
          <DialogDescription className="text-sm text-mid">
            The customer will be refunded automatically. Tell them why so we
            can pass it on.
          </DialogDescription>
        </div>

        <div className="mt-4 space-y-2">
          {REASONS.map((r) => {
            const active = picked === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setPicked(r.value)}
                className={cn(
                  'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors',
                  active
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-border bg-white text-dark hover:bg-surface',
                )}
              >
                <span>{r.label}</span>
                <span
                  aria-hidden
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border',
                    active ? 'border-red-500 bg-red-500 text-white' : 'border-border',
                  )}
                >
                  {active && '✓'}
                </span>
              </button>
            );
          })}

          {isOther && (
            <textarea
              value={otherText}
              onChange={(e) => setOtherText(e.target.value.slice(0, 500))}
              maxLength={500}
              rows={3}
              placeholder="Tell the customer what happened (3–500 chars)…"
              className="mt-2 w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm placeholder:text-mid focus:border-vendor focus:outline-none focus:ring-2 focus:ring-vendor/20"
              autoFocus
            />
          )}
        </div>

        <div className="mt-6 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={!canConfirm}
            onClick={() => onConfirm(finalReason)}
          >
            {busy ? 'Rejecting…' : 'Confirm reject'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
