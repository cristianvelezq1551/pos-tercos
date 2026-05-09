'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

export interface TooltipProps {
  content: React.ReactNode;
  /** Posición. Default top. */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay en ms para mostrar. Default 300. */
  delay?: number;
  /** Children = el trigger (cualquier elemento). */
  children: React.ReactElement;
  className?: string;
}

const SIDE_POS: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
};

/**
 * Tooltip mínimo con hover/focus + delay. Para tooltip con interacción
 * compleja (links dentro), usar Popover.
 *
 * NO usar en mobile como única forma de exponer info — siempre tener
 * fallback visible.
 */
export function Tooltip({ content, side = 'top', delay = 300, children, className }: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const timerRef = React.useRef<number | null>(null);

  const show = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setOpen(false);
  };

  React.useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  return (
    <span className="relative inline-flex">
      {React.cloneElement(
        children as React.ReactElement<React.HTMLAttributes<HTMLElement>>,
        {
          onMouseEnter: show,
          onMouseLeave: hide,
          onFocus: show,
          onBlur: hide,
        },
      )}
      {open ? (
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-xs font-medium text-ink-50 shadow-md motion-safe:animate-[fadeIn_120ms_ease-out]',
            SIDE_POS[side],
            className,
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
Tooltip.displayName = 'Tooltip';
