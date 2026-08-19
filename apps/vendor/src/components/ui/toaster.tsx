'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  cn,
} from '@feastpot/ui';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/**
 * Tiny in-app toast/modal system, built on Radix Toast + Dialog primitives
 * re-exported from @feastpot/ui.
 *
 * variant="destructive"  → centred blocking Dialog modal (requires dismissal).
 *                          Error messages are often multi-sentence; a modal
 *                          gives them space and ensures vendors read them.
 *
 * variant="default"      → bottom-right auto-dismiss toast (short confirmations
 *                          like "Saved", "Photo updated", etc.).
 *
 * The useToast() API is unchanged so no call-sites need updating.
 */
export interface ToastInput {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
  durationMs?: number;
}

interface InternalToast extends ToastInput {
  id: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => void;
}

const ToastCtx = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within <Toaster>');
  return ctx;
}

let nextId = 0;

export function Toaster({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<InternalToast[]>([]);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = ++nextId;
    setItems((prev) => [...prev, { ...input, id }]);
  }, []);

  // Split queue: errors → modal, success/info → toast strip
  const modals = items.filter((t) => t.variant === 'destructive');
  const toasts = items.filter((t) => t.variant !== 'destructive');

  // Show the oldest error modal first (FIFO).
  const activeModal = modals[0] ?? null;

  return (
    <ToastCtx.Provider value={{ toast }}>
      {/* ── Error modal ──────────────────────────────────────────── */}
      {activeModal && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) remove(activeModal.id);
          }}
        >
          <DialogContent
            className="max-w-md"
            // Prevent closing on overlay click: vendors must read errors.
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="space-y-1">
                  {activeModal.title && (
                    <DialogTitle className="text-base font-semibold leading-snug">
                      {activeModal.title}
                    </DialogTitle>
                  )}
                  {activeModal.description && (
                    <DialogDescription className="text-sm leading-relaxed text-foreground/80">
                      {activeModal.description}
                    </DialogDescription>
                  )}
                </div>
              </div>
            </DialogHeader>

            <div className="mt-4 flex justify-end">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => remove(activeModal.id)}
              >
                OK, understood
              </Button>
            </div>

            {modals.length > 1 && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {modals.length - 1} more error{modals.length > 2 ? 's' : ''} waiting
              </p>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* ── Success / info toasts (bottom-right strip) ───────────── */}
      <ToastProvider>
        {children}
        {toasts.map((t) => (
          <Toast
            key={t.id}
            duration={t.durationMs ?? 4000}
            onOpenChange={(open) => {
              if (!open) remove(t.id);
            }}
          >
            <div className="flex items-start gap-2 flex-1">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <div>
                {t.title && (
                  <ToastTitle className="text-sm font-semibold">{t.title}</ToastTitle>
                )}
                {t.description && (
                  <ToastDescription className="text-sm opacity-90">
                    {t.description}
                  </ToastDescription>
                )}
              </div>
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastCtx.Provider>
  );
}
