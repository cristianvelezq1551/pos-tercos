'use client';

import { cn } from '@pos-tercos/ui';

/**
 * Foto del producto SIN recorte: `object-contain` la muestra entera y el sobrante
 * del marco lo rellena una copia difuminada de la misma foto (una sola descarga,
 * el browser reusa la del caché). Sirve para fotos verticales y horizontales.
 *
 * §3.7 (perf): `loading="lazy"` + `decoding="async"` en ambas, y `fetchPriority`
 * bajo en el fondo difuminado (es decorativo). Pendiente el fix GRANDE —
 * descargar una versión REDIMENSIONADA en vez del original full-res para un
 * thumbnail de ~80px: requiere decidir el delivery de media en prod (Cloudflare
 * Image Resizing sobre `media.tercos.co`, o `next/image` con un dominio R2 NO
 * presignado + `remotePatterns`). Sin ese dato, `next/image` podría romper el
 * render (URLs presignadas dinámicas), así que queda como follow-up.
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
        decoding="async"
        fetchPriority="low"
        className={cn(
          'absolute inset-0 h-full w-full scale-125 object-cover blur-xl saturate-[1.4]',
          unavailable ? 'opacity-20' : 'opacity-50',
        )}
      />
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
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
