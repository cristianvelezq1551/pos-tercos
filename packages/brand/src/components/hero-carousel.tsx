'use client';

import { cn } from '@pos-tercos/ui';
import { useEffect, useState } from 'react';

export interface HeroCarouselImage {
  url: string;
  alt: string;
  caption?: string;
}

export interface HeroCarouselProps {
  images: HeroCarouselImage[];
  /** Texto rotativo grande que sobreescribe `image.caption`. */
  captions?: string[];
  /** Duración de cada slide. Crossfade ocupa los últimos 1200 ms. */
  intervalMs?: number;
  /** Aplica blur a la imagen (útil cuando hay un overlay grande encima). */
  blur?: boolean;
  /** Donde se ancla el caption sobre la imagen. */
  textPosition?: 'center' | 'bottom';
  /** Oculta el caption — útil cuando otro elemento cubre la zona del texto. */
  hideCaption?: boolean;
  className?: string;
}

const DEFAULT_INTERVAL = 5500;

export const FAST_FOOD_CAPTIONS = [
  'Carne jugosa, recién hecha',
  'Crujiente, con mucho sabor',
  'Hamburguesas con carácter',
  'Para los que tienen hambre real',
  'Burritos con todo el sabor',
  'Mac & cheese cremoso',
  'Pollo crocante, especiado',
  'Hambre con buen apellido',
];

/**
 * Carrusel hero con ken-burns + crossfade. Pensado para ocupar áreas grandes
 * de la pantalla pública. Una sola imagen visible a la vez, transición lenta,
 * sin libs externas — solo CSS keyframes.
 */
export function HeroCarousel({
  images,
  captions,
  intervalMs = DEFAULT_INTERVAL,
  blur = false,
  textPosition = 'bottom',
  hideCaption = false,
  className,
}: HeroCarouselProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % images.length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [images.length, intervalMs]);

  if (images.length === 0) return null;

  const captionPool = captions && captions.length > 0 ? captions : null;
  const currentCaption = captionPool
    ? captionPool[index % captionPool.length]
    : (images[index].caption ?? images[index].alt);

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden bg-background',
        className,
      )}
    >
      {images.map((img, i) => {
        const active = i === index;
        const altKenburns = i % 2 === 1;
        return (
          <img
            key={img.url + i}
            src={img.url}
            alt={img.alt}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            draggable={false}
            className={cn(
              'absolute inset-0 h-full w-full select-none object-cover',
              blur && 'blur-[2px]',
            )}
            style={{
              opacity: active ? 1 : 0,
              transition: 'opacity 1200ms var(--ease-in-out)',
              animation: active
                ? `${altKenburns ? 'hero-kenburns-alt' : 'hero-kenburns'} ${
                    intervalMs + 1500
                  }ms var(--ease-in-out) forwards`
                : undefined,
              willChange: active ? 'transform, opacity' : undefined,
            }}
          />
        );
      })}

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            textPosition === 'bottom'
              ? 'linear-gradient(to top, rgba(19,24,34,0.92) 0%, rgba(19,24,34,0.45) 35%, rgba(19,24,34,0.10) 60%, transparent 100%)'
              : 'radial-gradient(ellipse at center, rgba(19,24,34,0.30) 0%, rgba(19,24,34,0.85) 80%)',
        }}
      />

      {hideCaption ? null : (
        <Caption text={currentCaption} position={textPosition} />
      )}
    </div>
  );
}

function Caption({
  text,
  position,
}: {
  text: string;
  position: 'center' | 'bottom';
}) {
  return (
    <div
      key={text}
      className={cn(
        'pointer-events-none absolute left-0 right-0 px-12 text-center',
        position === 'bottom' ? 'bottom-[8%]' : 'top-1/2 -translate-y-1/2',
      )}
      style={{ animation: 'caption-slide 700ms var(--ease-out-quad) backwards' }}
    >
      <span
        className="font-display font-extrabold uppercase text-foreground drop-shadow-2xl"
        style={{
          fontSize: 'clamp(3rem, 6vw, 6.5rem)',
          letterSpacing: '0.04em',
          lineHeight: 1.05,
        }}
      >
        {text}
      </span>
    </div>
  );
}
