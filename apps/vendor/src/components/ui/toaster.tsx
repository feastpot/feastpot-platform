'use client';

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  cn,
} from '@feastpot/ui';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/**
 * Tiny in-app toast system, built on Radix Toast primitives re-exported from
 * @feastpot/ui. We can't use a `useToast` from the shared UI package because
 * it doesn't expose one yet — and adding a stateful hook there would couple
 * every consumer to the same provider tree. A local Provider/hook keeps the
 * vendor portal self-contained and avoids cross-app changes.
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

  return (
    <ToastCtx.Provider value={{ toast }}>
      <ToastProvider>
        {children}
        {items.map((t) => (
          <Toast
            key={t.id}
            duration={t.durationMs ?? 4000}
            onOpenChange={(open) => {
              if (!open) remove(t.id);
            }}
            className={cn(
              t.variant === 'destructive' && 'border-destructive bg-destructive text-destructive-foreground',
            )}
          >
            <div className="flex-1">
              {t.title && <ToastTitle className="text-sm font-semibold">{t.title}</ToastTitle>}
              {t.description && (
                <ToastDescription className="text-sm opacity-90">{t.description}</ToastDescription>
              )}
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastCtx.Provider>
  );
}
