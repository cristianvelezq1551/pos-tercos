'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/utils';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Tailwind max-width class. Default: max-w-2xl. */
  maxWidth?: string;
}

const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'max-w-2xl',
}) => {
  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onEsc);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onEsc);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const overlay = (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-950/50 p-4 backdrop-blur-sm sm:p-8 motion-safe:animate-[fadeIn_120ms_ease-out]"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={cn(
          'relative my-8 flex w-full flex-col rounded-2xl border border-border bg-card shadow-xl',
          'motion-safe:animate-[scaleIn_150ms_ease-out]',
          maxWidth,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-border px-6 py-4">
          <div className="min-w-0">
            <h2
              id="dialog-title"
              className="font-display text-xl font-bold tracking-tight text-foreground"
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-4 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Cerrar"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 1 0 1.06 1.06L10 11.06l5.72 5.72a.75.75 0 0 0 1.06-1.06L11.06 10l5.72-5.72a.75.75 0 0 0-1.06-1.06L10 8.94 4.28 3.22Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </header>

        <div className="overflow-y-auto px-6 py-5">{children}</div>

        {footer ? (
          <footer className="flex justify-end gap-2 border-t border-border bg-muted/40 px-6 py-4">
            {footer}
          </footer>
        ) : null}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.96) translateY(-4px) } to { opacity: 1; transform: scale(1) translateY(0) } }
      `}</style>
    </div>
  );

  return createPortal(overlay, document.body);
};

Dialog.displayName = 'Dialog';

export { Dialog };
