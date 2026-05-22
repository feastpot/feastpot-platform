'use client';

import {
  Button,
  DialogDescription,
  DialogTitle,
  Sheet,
  SheetContent,
} from '@feastpot/ui';
import { useEffect, useState } from 'react';

export interface NeedsClarificationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  busy?: boolean;
  /** Question text (3 to 500 chars) sent to the customer. */
  onConfirm: (question: string) => void;
}

/**
 * Bottom-sheet that lets the vendor put an order into `needs_clarification`
 * with a free-text question for the customer. The question is appended to
 * the order notes by the API, where the customer-facing tracking page
 * surfaces it for reply.
 */
export function NeedsClarificationSheet({
  open,
  onOpenChange,
  orderNumber,
  busy,
  onConfirm,
}: NeedsClarificationSheetProps) {
  const [text, setText] = useState('');

  useEffect(() => {
    if (!open) setText('');
  }, [open]);

  const trimmed = text.trim();
  const canConfirm = trimmed.length >= 3 && trimmed.length <= 500 && !busy;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <div className="space-y-1 pr-6">
          <DialogTitle className="text-lg font-bold text-dark">
            Ask the customer about {orderNumber}
          </DialogTitle>
          <DialogDescription className="text-sm text-mid">
            The order pauses and the customer is asked your question. You can
            accept or reject once they reply.
          </DialogDescription>
        </div>

        <div className="mt-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 500))}
            maxLength={500}
            rows={4}
            placeholder="e.g. We are out of jollof rice. Would basmati work, or shall we refund?"
            className="w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm placeholder:text-mid focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
            autoFocus
          />
          <p className="mt-1 text-right text-[11px] text-mid">{text.length}/500</p>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-teal text-white hover:bg-teal-dark"
            disabled={!canConfirm}
            onClick={() => onConfirm(trimmed)}
          >
            {busy ? 'Sending…' : 'Ask customer'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
