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
 * Local toast system mirroring apps/vendor's. We can't use a shared `useToast`
 * from @feastpot/ui because no such hook is exported; a per-app provider
 * keeps state local without coupling all apps to one tree.
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
