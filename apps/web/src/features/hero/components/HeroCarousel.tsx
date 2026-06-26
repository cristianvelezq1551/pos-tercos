'use client';

import type { WebHeroSlide } from '@pos-tercos/types';
import { useEffect, useRef, useState } from 'react';

const ROTATE_MS = 6_000;

/**
 * Publicidad rotativa arriba del menú (configurable por el dueño). Crossfade por
 * opacidad con CSS (sin libs), auto-avance pausable. La primera pieza carga
 * eager (es el LCP); el resto lazy. Cada pieza puede ser clickeable (linkUrl).
 */
export function HeroCarousel({ slides }: { slides: WebHeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  useEffect(() => {
    if (count <= 1 || paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(id);
  }, [count, paused]);

  return (
    <section
      aria-label="Publicidad"
      className="relative -mt-16 h-[min(620px,80vh)] w-full overflow-hidden bg-black"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {slides.map((s, i) => (
        <SlideLink
          key={s.id}
          href={s.linkUrl}
          className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${
            i === index ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <SlideMedia slide={s} active={i === index} priority={i === 0} />
        </SlideLink>
      ))}

      {/* Difuminado inferior para fundir con el fondo de la página. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background"
      />

      {count > 1 ? (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Ir a la publicidad ${i + 1}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={`h-2 rounded-full transition-all ${
                i === index ? 'w-6 bg-white' : 'w-2 bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Imagen o video de una pieza. El video solo reproduce cuando está activo
 *  (ahorra datos en móvil); la primera imagen carga eager (es el LCP). */
function SlideMedia({
  slide,
  active,
  priority,
}: {
  slide: WebHeroSlide;
  active: boolean;
  priority: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (active) void el.play().catch(() => undefined);
    else el.pause();
  }, [active]);

  if (slide.mediaType === 'VIDEO') {
    return (
      <video
        ref={videoRef}
        src={slide.mediaUrl}
        muted
        loop
        playsInline
        preload={priority ? 'auto' : 'metadata'}
        aria-hidden
        className="h-full w-full select-none object-cover"
      />
    );
  }

  return (
    <img
      src={slide.mediaUrl}
      alt=""
      aria-hidden
      draggable={false}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      className="h-full w-full select-none object-cover"
    />
  );
}

/** Envuelve la pieza en un link si tiene `href`; externo abre en pestaña nueva. */
function SlideLink({
  href,
  className,
  children,
}: {
  href: string | null;
  className: string;
  children: React.ReactNode;
}) {
  if (!href) return <div className={className}>{children}</div>;
  const external = /^https?:\/\//i.test(href);
  return (
    <a
      href={href}
      className={className}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}
