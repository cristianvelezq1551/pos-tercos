'use client';

import { cn } from '@pos-tercos/ui';
import Image from 'next/image';

/**
 * Foto del producto SIN recorte: `object-contain` la muestra entera y el sobrante
 * del marco lo rellena una copia difuminada de la misma foto (una sola descarga,
 * el browser reusa la del caché). Sirve para fotos verticales y horizontales.
 *
 * §3.7 (perf): usa `next/image` (`fill`) → descarga una versión REDIMENSIONADA a
 * WebP/AVIF según el tamaño del contenedor (`sizes`), no el original full-res
 * para un thumbnail de ~80px. La URL de la imagen es `/api/products/images/…`
 * (MISMO origen, no presignada de R2) → el optimizador la sirve sin
 * `remotePatterns`. El contenedor debe ser `relative` + con tamaño (lo son:
 * ProductCard `aspect-square`, PickerHeader `aspect-[4/3]`).
 */
export function ProductImage({
  src,
  alt,
  unavailable = false,
  zoomOnHover = false,
  className,
  sizes = '(max-width: 640px) 50vw, 200px',
}: {
  src: string | null;
  alt: string;
  unavailable?: boolean;
  zoomOnHover?: boolean;
  className?: string;
  /** Tamaño renderizado para que next/image elija el candidato del srcset. */
  sizes?: string;
}) {
  if (!src) return <ProductImageFallback label={alt} className={className} />;

  return (
    <>
      <Image
        src={src}
        alt=""
        aria-hidden
        fill
        sizes={sizes}
        className={cn(
          'scale-125 object-cover blur-xl saturate-[1.4]',
          unavailable ? 'opacity-20' : 'opacity-50',
        )}
      />
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={cn(
          'object-contain',
          unavailable && 'grayscale',
          zoomOnHover &&
            !unavailable &&
            'sm:transition-transform sm:duration-300 sm:group-hover:scale-105',
          className,
        )}
      />
    </>
  );
}

export function ProductImageFallback({ label, className }: { label: string; className?: string }) {
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
