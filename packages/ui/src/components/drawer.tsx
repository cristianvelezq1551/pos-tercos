'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Lado desde el que entra. Default: right. */
  side?: 'right' | 'left';
  /** Tailwind max-width / width. Default: max-w-md. */
  width?: string;
  /** Children = Drawer.Header + Drawer.Body + Drawer.Footer (slots). */
  children: React.ReactNode;
  /** aria-label del aside. */
  label?: string;
}

const SIDE_CLASS: Record<NonNullable<DrawerProps['side']>, string> = {
  right: 'right-0 motion-safe:animate-[slideInRight_200ms_ease-out]',
  left: 'left-0 motion-safe:animate-[slideInLeft_200ms_ease-out]',
};

/**
 * Drawer canónico (slide-in desde el lado). Reemplaza WebOrdersDrawer y CartDrawer.
 *
 *   <Drawer open={open} onClose={close}>
 *     <Drawer.Header title="Pedidos web" subtitle="3 pendientes" onClose={close} />
 *     <Drawer.Body>...</Drawer.Body>
 *     <Drawer.Footer>...</Drawer.Footer>
 *   </Drawer>
 */
function DrawerRoot({
  open,
  onClose,
  side = 'right',
  width = 'max-w-md',
  children,
  label,
}: DrawerProps) {
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

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex bg-ink-950/45 backdrop-blur-sm motion-safe:animate-[fadeIn_120ms_ease-out]"
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label ?? 'Panel'}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'absolute inset-y-0 flex w-full flex-col border-border bg-card shadow-xl',
          side === 'right' ? 'border-l' : 'border-r',
          SIDE_CLASS[side],
          width,
        )}
      >
        {children}
      </aside>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideInRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
        @keyframes slideInLeft { from { transform: translateX(-100%) } to { transform: translateX(0) } }
      `}</style>
    </div>
  );
}
DrawerRoot.displayName = 'Drawer';

interface DrawerHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  onClose?: () => void;
  /** Slot a la derecha del título (badge, ConnectionDot, etc.). */
  trailing?: React.ReactNode;
}

function DrawerHeader({ title, subtitle, onClose, trailing }: DrawerHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold leading-tight tracking-tight text-foreground">
          {title}
        </h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {trailing}
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            // Ver dialog.tsx: 44px en dedo, compacto en puntero fino.
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:h-11 pointer-coarse:w-11"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M4.28 3.22a.75.75 0 0 0-1.06 1.06L8.94 10l-5.72 5.72a.75.75 0 1 0 1.06 1.06L10 11.06l5.72 5.72a.75.75 0 0 0 1.06-1.06L11.06 10l5.72-5.72a.75.75 0 0 0-1.06-1.06L10 8.94 4.28 3.22Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        ) : null}
      </div>
    </header>
  );
}
DrawerHeader.displayName = 'Drawer.Header';

function DrawerBody({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex-1 overflow-y-auto px-5 py-4', className)} {...rest}>
      {children}
    </div>
  );
}
DrawerBody.displayName = 'Drawer.Body';

function DrawerFooter({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <footer
      className={cn('shrink-0 border-t border-border bg-muted/40 px-5 py-3', className)}
      {...rest}
    >
      {children}
    </footer>
  );
}
DrawerFooter.displayName = 'Drawer.Footer';

export const Drawer = Object.assign(DrawerRoot, {
  Header: DrawerHeader,
  Body: DrawerBody,
  Footer: DrawerFooter,
});
