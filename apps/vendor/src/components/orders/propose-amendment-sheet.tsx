'use client';

import { Button, DialogDescription, DialogTitle, Sheet, SheetContent } from '@feastpot/ui';
import { useEffect, useState } from 'react';

export interface ProposeAmendmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  busy?: boolean;
  /** Submit with proposed change text + optional refund amount in pence (negative). */
  onConfirm: (proposedChange: string, priceDeltaPence: number) => void;
}

/**
 * Vendor-side UI for FR-AMD-001. Captures a short free-text description of
 * the change ("swap rice for chips", "30 min late", etc.) plus an optional
 * refund amount in pounds - the customer must accept inside 30 min or it
 * auto-declines server-side.
 *
 * Refund is captured as a positive £ amount in the input but transmitted as a
 * negative pence delta because the API treats negative as money returning to
 * the customer (the only direction we currently support).
 */
export function ProposeAmendmentSheet({
  open,
  onOpenChange,
  orderNumber,
  busy,
  onConfirm,
}: ProposeAmendmentSheetProps) {
  const [text, setText] = useState('');
  const [refundPounds, setRefundPounds] = useState('');

  useEffect(() => {
    if (!open) {
      setText('');
      setRefundPounds('');
    }
  }, [open]);

  const trimmed = text.trim();
  const refundPence = (() => {
    if (!refundPounds) return 0;
    const n = Number(refundPounds);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  })();
  const canSubmit =
    !busy && trimmed.length >= 3 && trimmed.length <= 500 && refundPence !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <div className="space-y-1 pr-6">
          <DialogTitle className="text-lg font-bold text-dark">
            Propose a change to order {orderNumber}
          </DialogTitle>
          <DialogDescription className="text-sm text-mid">
            The customer has 30 minutes to accept. No reply = declined.
          </DialogDescription>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-dark">What's changing?</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="e.g. We're 20 minutes late, OR swapping rice for chips"
              className="block w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm focus:border-teal focus:outline-none"
            />
            <span className="mt-1 block text-right text-[11px] text-mid">{trimmed.length}/500</span>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-dark">Refund customer (optional, £)</span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={refundPounds}
              onChange={(e) => setRefundPounds(e.target.value)}
              placeholder="0.00"
              className="block w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm focus:border-teal focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-mid">
              Optional partial refund issued automatically if accepted.
            </span>
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => onConfirm(trimmed, -(refundPence ?? 0))}
            className="flex-[1.6] bg-teal text-white hover:bg-teal-dark"
          >
            {busy ? 'Sending…' : 'Send to customer'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
