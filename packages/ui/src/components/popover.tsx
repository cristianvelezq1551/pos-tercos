'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

export interface PopoverProps {
  /** Trigger (button, ícono). Recibe onClick automáticamente. */
  trigger: React.ReactElement;
  /** Contenido del popover. */
  children: React.ReactNode;
  /** Posición. Default `bottom-end`. */
  align?: 'start' | 'center' | 'end';
  side?: 'bottom' | 'top';
  className?: string;
}

const ALIGN: Record<NonNullable<PopoverProps['align']>, string> = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
};

const SIDE: Record<NonNullable<PopoverProps['side']>, string> = {
  bottom: 'top-full mt-1.5',
  top: 'bottom-full mb-1.5',
};

/**
 * Popover click-toggle, click-outside-to-close. Para menús contextuales,
 * filtros, color pickers, etc.
 */
export function Popover({
  trigger,
  children,
  align = 'end',
  side = 'bottom',
  className,
}: PopoverProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLSpanElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <span ref={containerRef} className="relative inline-flex">
      {React.cloneElement(trigger as React.ReactElement<React.HTMLAttributes<HTMLElement>>, {
        onClick: (e: React.MouseEvent) => {
          e.preventDefault();
          setOpen((o) => !o);
        },
        'aria-expanded': open,
        'aria-haspopup': true,
      })}
      {open ? (
        <div
          role="dialog"
          className={cn(
            'absolute z-40 min-w-[12rem] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg motion-safe:animate-[scaleIn_120ms_ease-out]',
            ALIGN[align],
            SIDE[side],
            className,
          )}
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}
Popover.displayName = 'Popover';
