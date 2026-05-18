'use client';

import { Button, DialogDescription, DialogTitle, Sheet, SheetContent, cn } from '@feastpot/ui';
import { useEffect, useState } from 'react';

const PRESETS = [15, 30, 45, 60] as const;

export interface DispatchEtaSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber: string;
  busy?: boolean;
  /** Confirm with chosen ETA in minutes (or null to skip ETA). */
  onConfirm: (etaMinutes: number | null) => void;
}

/**
 * Shown right before the vendor flips an order to "dispatched". Captures the
 * driver's stated ETA so the customer's tracking page can show a real
 * countdown instead of the vague "soon". Quick-pick chips cover the common
 * cases; a custom field handles the long tail (1–240 minutes per the API).
 *
 * "Skip" still lets the vendor dispatch with no ETA - back-compat with the
 * existing flow for vendors who don't want to commit to a time.
 */
export function DispatchEtaSheet({
  open,
  onOpenChange,
  orderNumber,
  busy,
  onConfirm,
}: DispatchEtaSheetProps) {
  const [picked, setPicked] = useState<number | 'custom' | null>(null);
  const [customText, setCustomText] = useState('');

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setCustomText('');
    }
  }, [open]);

  const customMinutes = (() => {
    const n = Number(customText);
    return Number.isFinite(n) && n >= 1 && n <= 240 ? Math.floor(n) : null;
  })();
  const canConfirm =
    !busy && (typeof picked === 'number' || (picked === 'custom' && customMinutes !== null));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <div className="space-y-1 pr-6">
          <DialogTitle className="text-lg font-bold text-dark">
            Dispatch order {orderNumber}
          </DialogTitle>
          <DialogDescription className="text-sm text-mid">
            How long until the customer gets it? They'll see the countdown live.
          </DialogDescription>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2">
          {PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setPicked(m)}
              className={cn(
                'touch-target rounded-2xl border text-sm font-semibold transition',
                picked === m
                  ? 'border-vendor bg-vendor text-white'
                  : 'border-border bg-white text-dark hover:bg-surface',
              )}
            >
              {m} min
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          <button
            type="button"
            onClick={() => setPicked('custom')}
            className={cn(
              'flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-sm font-medium',
              picked === 'custom'
                ? 'border-vendor bg-vendor/5 text-vendor'
                : 'border-border bg-white text-dark hover:bg-surface',
            )}
          >
            <span>Custom</span>
            <span className="text-xs text-mid">1–240 min</span>
          </button>
          {picked === 'custom' && (
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={240}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="e.g. 25"
              className="block w-full rounded-2xl border border-border bg-white px-3 py-2 text-sm focus:border-vendor focus:outline-none"
            />
          )}
        </div>

        <div className="mt-5 flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onConfirm(null)}
            className="flex-1"
          >
            Skip
          </Button>
          <Button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              const eta = picked === 'custom' ? customMinutes : (picked as number);
              onConfirm(eta);
            }}
            className="flex-[1.6] bg-vendor text-white hover:bg-vendor-dark"
          >
            {busy ? 'Dispatching…' : 'Dispatch'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
