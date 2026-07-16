'use client';

import { MapPin, Navigation } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { googleDirectionsUrl, wazeUrl } from '../lib/contact-links';
import { useBusiness } from '../store/business-store';

/**
 * "Cómo llegar" → elegir app de navegación. Abre hacia arriba: la tarjeta que
 * lo contiene recorta el overflow. Waze solo aparece si hay coordenadas.
 */
export function DirectionsMenu() {
  const contact = useBusiness((s) => s.business.contact);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const apps = [
    { label: 'Google Maps', href: googleDirectionsUrl(contact), icon: MapPin },
    { label: 'Waze', href: wazeUrl(contact), icon: Navigation },
  ].filter((a): a is { label: string; href: string; icon: typeof MapPin } => Boolean(a.href));

  if (apps.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      {open ? (
        <div
          role="menu"
          aria-label="Abrir con"
          className="absolute bottom-full left-0 right-0 z-10 mb-2 flex flex-col gap-1 rounded-2xl border border-border bg-card p-2 shadow-2xl motion-safe:animate-[popIn_120ms_ease-out]"
        >
          {apps.map(({ label, href, icon: Icon }) => (
            <a
              key={label}
              role="menuitem"
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <Icon className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.25} />
              {label}
            </a>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => (apps.length === 1 ? window.open(apps[0]!.href, '_blank') : setOpen((v) => !v))}
        aria-haspopup={apps.length > 1 ? 'menu' : undefined}
        aria-expanded={apps.length > 1 ? open : undefined}
        className="press inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-md transition-colors hover:bg-red-700 active:bg-red-800"
      >
        <MapPin className="h-4 w-4" strokeWidth={2.25} />
        Cómo llegar
      </button>

      <style>{`
        @keyframes popIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>
    </div>
  );
}
