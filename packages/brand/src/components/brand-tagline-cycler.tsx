'use client';

import { cn } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';

export interface BrandTaglineCyclerProps {
  taglines?: string[];
  /** Cuánto dura cada tagline visible. Default 8000 ms. */
  intervalMs?: number;
  className?: string;
}

export const TERCOS_TAGLINES = [
  'Hambre con carácter',
  'Carne con buen apellido',
  'Burger sin pedir permiso',
  'Sabor que se respeta',
];

const FADE_MS = 600;

/**
 * Cicla taglines de marca con crossfade. Pensado para estados vacíos en la
 * pantalla pública. Texto en font-display caps, tracking expandido.
 */
export function BrandTaglineCycler({
  taglines = TERCOS_TAGLINES,
  intervalMs = 8000,
  className,
}: BrandTaglineCyclerProps) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (taglines.length <= 1) return;
    const swap = setInterval(() => {
      setVisible(false);
      const t = setTimeout(() => {
        setIndex((i) => (i + 1) % taglines.length);
        setVisible(true);
      }, FADE_MS);
      return () => clearTimeout(t);
    }, intervalMs);
    return () => clearInterval(swap);
  }, [taglines.length, intervalMs]);

  if (taglines.length === 0) return null;

  return (
    <div
      className={cn(
        'caps font-display text-foreground transition-opacity',
        className,
      )}
      style={{
        opacity: visible ? 1 : 0,
        transitionDuration: `${FADE_MS}ms`,
        letterSpacing: '0.45em',
      }}
    >
      {taglines[index]}
    </div>
  );
}
