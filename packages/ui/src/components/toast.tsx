'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastInput {
  /** Identificador único — si se omite, se genera. */
  id?: string;
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Duración en ms. Default 4000. Pasar Infinity para sticky. */
  duration?: number;
  /** Acción opcional (link, retry, undo). */
  action?: { label: string; onClick: () => void };
}

interface ToastInternal extends ToastInput {
  id: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
  toasts: ToastInternal[];
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

let counter = 0;
function nextId() {
  counter += 1;
  return `t-${Date.now()}-${counter}`;
}

/**
 * Provider del sistema de toasts. Montar en el layout más alto de la app
 * (típicamente en `(authenticated)/layout.tsx` o `app/layout.tsx`).
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastInternal[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    (input: ToastInput) => {
      const id = input.id ?? nextId();
      const finalToast: ToastInternal = {
        id,
        title: input.title,
        description: input.description,
        tone: input.tone ?? 'info',
        duration: input.duration ?? 4000,
        action: input.action,
      };
      setToasts((prev) => [...prev, finalToast]);
      if (finalToast.duration !== Infinity) {
        window.setTimeout(() => dismiss(id), finalToast.duration);
      }
      return id;
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss, toasts }}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

/**
 * Hook para disparar toasts desde cualquier componente.
 *
 *   const { toast } = useToast();
 *   toast({ title: 'Guardado', tone: 'success' });
 */
export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'border-success-border bg-success-bg text-success',
  error: 'border-red-200 bg-red-50 text-destructive',
  warning: 'border-warning-border bg-warning-bg text-warning',
  info: 'border-border bg-card text-foreground',
};

const TONE_ICON: Record<ToastTone, React.ReactNode> = {
  success: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm-1 4a1 1 0 1 1 2 0v4a1 1 0 1 1-2 0V6Zm1 9a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M8.6 2.7a1.6 1.6 0 0 1 2.8 0l6.2 11a1.6 1.6 0 0 1-1.4 2.4H3.8a1.6 1.6 0 0 1-1.4-2.4l6.2-11ZM10 8a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0V9a1 1 0 0 0-1-1Zm0 6.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm-1 4.5a1 1 0 1 1 2 0v4a1 1 0 1 1-2 0v-4Z" />
    </svg>
  ),
};

/**
 * Renderiza la cola de toasts. Montado automáticamente por `<ToastProvider>`.
 */
function Toaster() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) return null;

  return (
    <div
      aria-live="polite"
      role="region"
      aria-label="Notificaciones"
      className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end"
    >
      {ctx.toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-card p-3 shadow-lg motion-safe:animate-[scaleIn_180ms_ease-out]',
            TONE_CLASS[t.tone],
          )}
        >
          <span className="mt-0.5 shrink-0">{TONE_ICON[t.tone]}</span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-sm font-semibold text-foreground">{t.title}</p>
            {t.description ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
            ) : null}
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  t.action?.onClick();
                  ctx.dismiss(t.id);
                }}
                className="mt-1.5 text-xs font-semibold text-primary hover:underline"
              >
                {t.action.label}
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => ctx.dismiss(t.id)}
            aria-label="Cerrar"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 1 0 1.06 1.06L10 11.06l5.72 5.72a.75.75 0 0 0 1.06-1.06L11.06 10l5.72-5.72a.75.75 0 0 0-1.06-1.06L10 8.94 4.28 3.22Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
Toaster.displayName = 'Toaster';
