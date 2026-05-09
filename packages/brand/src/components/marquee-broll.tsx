'use client';

import { cn } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';

export interface MarqueeBRollImage {
  url: string;
  alt: string;
}

export interface MarqueeBRollProps {
  images: MarqueeBRollImage[];
  /** Tiempo de cada imagen visible (incluye fade-in/out). Default 6000 ms. */
  durationMs?: number;
  /** Opacidad final de las imágenes (sutil = 0.18). */
  opacity?: number;
  /** Activa zoom-pan lento adicional. */
  ken?: boolean;
  className?: string;
}

const DEFAULT_DURATION = 6000;

/**
 * Loop de imágenes con crossfade lento. Pensado para usarse como background
 * full-bleed en estados vacíos. Sin libs externas, solo CSS keyframes y
 * un setInterval con cleanup.
 */
export function MarqueeBRoll({
  images,
  durationMs = DEFAULT_DURATION,
  opacity = 0.22,
  ken = true,
  className,
}: MarqueeBRollProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % images.length);
    }, durationMs);
    return () => clearInterval(id);
  }, [images.length, durationMs]);

  if (images.length === 0) return null;

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className,
      )}
      aria-hidden="true"
    >
      {images.map((img, i) => (
        <img
          key={img.url}
          src={img.url}
          alt={img.alt}
          loading={i === 0 ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover transition-opacity"
          style={{
            opacity: i === index ? opacity : 0,
            transitionDuration: `${Math.min(1200, durationMs / 4)}ms`,
            animation:
              ken && i === index
                ? `broll-zoom ${durationMs * 1.5}ms var(--ease-in-out) forwards`
                : undefined,
          }}
        />
      ))}
    </div>
  );
}
