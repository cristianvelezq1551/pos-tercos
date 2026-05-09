'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/utils';

export interface TurnBadgeXLProps {
  value: number;
  label?: string;
  className?: string;
  /** Disparado cuando el tick visual termina (slide-in completado). */
  onTickEnd?: () => void;
}

const TICK_OUT_MS = 180;
const TICK_IN_MS = 280;

/**
 * Insignia gigante del turno actual para pantalla pública (TV ~50").
 * Render mínimo: label "TURNO" caps + número en `--primary` font-display.
 * Cuando `value` cambia: slide-out del viejo + slide-in del nuevo (~460 ms).
 * Sin sonido (lo dispara el padre vía `onTickEnd`).
 */
export function TurnBadgeXL({
  value,
  label = 'Turno',
  className,
  onTickEnd,
}: TurnBadgeXLProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current === value) return;
    const next = value;
    prevRef.current = next;
    setPhase('out');
    const t1 = setTimeout(() => {
      setDisplayValue(next);
      setPhase('in');
    }, TICK_OUT_MS);
    const t2 = setTimeout(() => {
      setPhase('idle');
      onTickEnd?.();
    }, TICK_OUT_MS + TICK_IN_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [value, onTickEnd]);

  return (
    <div
      className={cn(
        'inline-flex flex-col items-center justify-center rounded-3xl border border-border bg-card px-10 py-7 shadow-xl',
        className,
      )}
    >
      <span className="caps text-xl tracking-[0.5em] text-muted-foreground">
        {label}
      </span>
      <div className="mt-1 overflow-hidden">
        <span
          className={cn(
            'block font-display font-extrabold leading-none tabular text-primary',
            phase === 'out' && 'anim-tick-out',
            phase === 'in' && 'anim-tick-in',
          )}
          style={{ fontSize: 'clamp(7rem, 11vw, 12rem)' }}
        >
          #{String(displayValue).padStart(2, '0')}
        </span>
      </div>
    </div>
  );
}
