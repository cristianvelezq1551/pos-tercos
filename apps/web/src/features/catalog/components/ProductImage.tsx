'use client';

import { cn } from '@pos-tercos/ui';

/**
 * Foto del producto SIN recorte: `object-contain` la muestra entera y el sobrante
 * del marco lo rellena una copia difuminada de la misma foto (una sola descarga,
 * el browser reusa la del caché). Sirve para fotos verticales y horizontales.
 */
export function ProductImage({
  src,
  alt,
  unavailable = false,
  zoomOnHover = false,
  className,
}: {
  src: string | null;
  alt: string;
  unavailable?: boolean;
  zoomOnHover?: boolean;
  className?: string;
}) {
  if (!src) return <ProductImageFallback label={alt} className={className} />;

  return (
    <>
      <img
        src={src}
        alt=""
        aria-hidden
        loading="lazy"
        className={cn(
          'absolute inset-0 h-full w-full scale-125 object-cover blur-xl saturate-[1.4]',
          unavailable ? 'opacity-20' : 'opacity-50',
        )}
      />
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={cn(
          'relative h-full w-full object-contain',
          unavailable && 'grayscale',
          zoomOnHover && !unavailable && 'sm:transition-transform sm:duration-300 sm:group-hover:scale-105',
          className,
        )}
      />
    </>
  );
}

export function ProductImageFallback({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  const initial = label.trim().charAt(0).toUpperCase() || 'T';
  return (
    <div
      className={cn(
        'flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-background',
        className,
      )}
    >
      <span className="font-display text-5xl font-extrabold uppercase tracking-[0.04em] text-white/10 sm:text-7xl">
        {initial}
      </span>
    </div>
  );
}
