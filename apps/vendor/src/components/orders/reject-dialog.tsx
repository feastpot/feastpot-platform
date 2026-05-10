'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@feastpot/ui';
import { useState } from 'react';

// Inline footer — @feastpot/ui doesn't ship a DialogFooter primitive. Keeping
// it local avoids modifying the shared package for a single layout helper.
function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 flex justify-end gap-2">{children}</div>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  onConfirm: (reason: string) => void;
  busy?: boolean;
}

export function RejectDialog({ open, onOpenChange, orderNumber, onConfirm, busy }: Props) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 500;

  function submit() {
    if (!valid || busy) return;
    onConfirm(trimmed);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setReason('');
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject order {orderNumber}?</DialogTitle>
          <DialogDescription>
            Tell the customer why — this is sent in their cancellation email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="reject-reason" className="text-sm font-medium">
            Reason
          </label>
          <Input
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. We're fully booked for that slot"
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">{trimmed.length}/500</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!valid || busy}>
            {busy ? 'Rejecting…' : 'Reject order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
